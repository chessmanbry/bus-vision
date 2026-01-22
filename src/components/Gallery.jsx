import { useState, useEffect, useRef } from 'react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { FaPlayCircle, FaTimes, FaPen, FaSave, FaShareAlt, FaTrash, FaHistory, FaRobot, FaExclamationTriangle, FaInfoCircle, FaImages, FaSearch } from 'react-icons/fa';

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import Tesseract from 'tesseract.js';

const METADATA_FILE = 'BusData/metadata.json';
const FOLDER_NAME = 'BusData';

export default function Gallery() {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  
  const [viewMode, setViewMode] = useState('video');
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [tempLabel, setTempLabel] = useState('');
  const [recentLabels, setRecentLabels] = useState([]);

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const [aiModel, setAiModel] = useState(null);
  const [aiStatus, setAiStatus] = useState('AI 模型載入中...');
  const [detectedObjects, setDetectedObjects] = useState('');
  const [isTargetFound, setIsTargetFound] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(''); 

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  const [magnifierPos, setMagnifierPos] = useState(null);
  
  const videoPlayerRef = useRef(null);

  // 🗣️ v2.1 語音報讀
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW';
      window.speechSynthesis.speak(utterance);
    }
  };

  const loadVideos = async () => {
    try {
      const contents = await Filesystem.readFile({ path: `${FOLDER_NAME}/metadata.json`, directory: Directory.Data, encoding: Encoding.UTF8 });
      setVideos(JSON.parse(contents.data));
    } catch (error) { setVideos([]); }
  };

  useEffect(() => {
    loadVideos();
    const savedLabels = localStorage.getItem('bus_recent_labels');
    if (savedLabels) setRecentLabels(JSON.parse(savedLabels));

    const loadModel = async () => {
      try {
        await tf.ready();
        const model = await cocoSsd.load();
        setAiModel(model);
        setAiStatus('✅ AI 助手已就緒');
      } catch (e) {
        setAiStatus('❌ AI 載入失敗');
      }
    };
    loadModel();
  }, []);

  const runOcr = async (imageElement) => {
    setOcrStatus('🔍 OCR 讀取中...');
    speak('正在讀取文字'); // 🔊
    try {
      const result = await Tesseract.recognize(imageElement, 'eng');
      const text = result.data.text.replace(/[^a-zA-Z0-9]/g, '');
      
      if (text.length >= 2) {
        setOcrStatus(`OCR: ${text.substring(0, 6)}`);
        setTempLabel(text.substring(0, 6)); 
        speak(`辨識到文字：${text.substring(0, 6)}`); // 🔊
      } else {
        setOcrStatus(''); 
        speak('沒有讀到文字');
      }
    } catch (e) {
      setOcrStatus('');
    }
  };

  const runAiDetection = async (imageElement) => {
    if (!aiModel) return;
    setAiStatus('🤖 分析中...');
    speak('AI 正在分析畫面'); // 🔊
    setOcrStatus('');
    setDetectedObjects('');
    setIsTargetFound(false);
    
    try {
      const predictions = await aiModel.detect(imageElement);
      if (predictions.length > 0) {
        const allClasses = [...new Set(predictions.map(p => p.class))];
        const allObjString = allClasses.join(', ');
        const target = predictions.find(p => ['bus', 'truck', 'car'].includes(p.class));

        if (target) {
          const [x, y, w, h] = target.bbox;
          setCurrentBox({ x, y, w, h });
          setIsTargetFound(true);
          setAiStatus(`✨ 建議標註：${target.class}`);
          setDetectedObjects(`包含: ${allObjString}`);
          speak(`發現${target.class}，正在讀取文字`); // 🔊
          runOcr(imageElement);
        } else {
          const fallback = predictions[0];
          const [x, y, w, h] = fallback.bbox;
          setCurrentBox({ x, y, w, h });
          setIsTargetFound(false);
          setAiStatus(`⚠️ 未發現車輛`);
          setDetectedObjects(`但發現：${allObjString}`);
          speak(`未發現車輛，但有${allObjString}`); // 🔊
        }
      } else {
        setAiStatus('👀 畫面乾淨');
        setDetectedObjects('無可辨識物體');
        setCurrentBox(null);
        speak('畫面中沒有辨識到物體'); // 🔊
      }
    } catch (e) { setAiStatus('AI 分析錯誤'); }
  };

  const handleVideoClick = async (video) => {
    try {
      speak(`開啟影片，距離數據：${video.distance || '無'}`); // 🔊
      const uri = await Filesystem.getUri({ path: video.path, directory: Directory.Data });
      setVideoUrl(Capacitor.convertFileSrc(uri.uri));
      setSelectedVideo(video);
      setViewMode('video');
      setCurrentBox(null);
      setOcrStatus('');
      if (aiModel) setAiStatus('✅ AI 助手已就緒'); 
    } catch (e) { alert('無法讀取影片'); }
  };

  const closeModal = () => { 
    setSelectedVideo(null); 
    setVideoUrl(''); 
    setSnapshotUrl(''); 
    speak('關閉視窗'); // 🔊
  };

  const handleExport = async () => {
    if (!selectedVideo) return;
    speak('正在準備匯出'); // 🔊
    try {
      const uriResult = await Filesystem.getUri({ path: selectedVideo.path, directory: Directory.Data });
      await Share.share({
        title: '匯出 BusVision 資料',
        text: `公車資料: ${selectedVideo.label || '未標註'} (距離: ${selectedVideo.distance || 'N/A'})`,
        url: uriResult.uri,
        dialogTitle: '上傳至雲端硬碟'
      });
    } catch (e) { if (e.message !== 'Share canceled') alert('匯出失敗'); }
  };

  const captureAndAnnotate = async () => {
    speak('截圖並開始標註'); // 🔊
    const video = videoPlayerRef.current;
    if (!video) return;
    video.pause();
    
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.95);
    setSnapshotUrl(base64Image);
    setImgSize({ w, h });
    setViewMode('annotation');
    setTempLabel(''); 

    const img = new Image();
    img.src = base64Image;
    img.onload = () => { runAiDetection(img); };
  };

  const getScaledPos = (e) => {
    const rect = imgRef.current.getBoundingClientRect(); 
    const touch = e.touches[0];
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
  };

  const handleTouchStart = (e) => {
    if (!imgRef.current) return;
    const pos = getScaledPos(e);
    setStartPos(pos);
    setIsDrawing(true);
    setIsTargetFound(true);
  };

  const handleTouchMove = (e) => {
    if (!isDrawing || !imgRef.current) return;
    const pos = getScaledPos(e);
    const w = pos.x - startPos.x;
    const h = pos.y - startPos.y;
    setCurrentBox({ x: startPos.x, y: startPos.y, w, h });
    const rect = imgRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    updateMagnifier(touch.clientX - rect.left, touch.clientY - rect.top, rect.width, rect.height);
  };

  const handleTouchEnd = () => { setIsDrawing(false); setMagnifierPos(null); };
  
  const updateMagnifier = (x, y, W, H) => {
    if (x<0||y<0||x>W||y>H) return;
    setMagnifierPos({ x, y, bgX: (x/W)*100, bgY: (y/H)*100 });
  };

  useEffect(() => {
    if (viewMode === 'annotation' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (currentBox) {
        ctx.strokeStyle = isTargetFound ? '#00FF00' : '#FF9800'; 
        ctx.lineWidth = 6;
        ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
        ctx.fillStyle = isTargetFound ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 152, 0, 0.2)';
        ctx.fillRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
      }
    }
  }, [viewMode, currentBox, imgSize, isTargetFound]);

  const saveAnnotation = async () => {
    if (!selectedVideo || !snapshotUrl) return;
    try {
      const timestamp = Date.now();
      const snapshotName = `Snap_${timestamp}.jpg`;
      const snapshotPath = `${FOLDER_NAME}/${snapshotName}`;
      await Filesystem.writeFile({ path: snapshotPath, data: snapshotUrl, directory: Directory.Data });
      
      const newAnnotation = {
        id: timestamp,
        path: snapshotPath,
        box: currentBox,
        label: tempLabel,
        canvasWidth: imgSize.w, 
        canvasHeight: imgSize.h
      };
      
      const updatedVideos = videos.map(v => {
        if (v.id === selectedVideo.id) { 
          const oldAnnotations = v.annotations || [];
          return { ...v, label: tempLabel || v.label, annotations: [newAnnotation, ...oldAnnotations] }; 
        }
        return v;
      });
      
      await Filesystem.writeFile({ path: `${FOLDER_NAME}/metadata.json`, data: JSON.stringify(updatedVideos), directory: Directory.Data, encoding: Encoding.UTF8 });
      setVideos(updatedVideos);
      
      if (tempLabel.trim() !== '') {
        const newLabels = [tempLabel, ...recentLabels.filter(l => l !== tempLabel)].slice(0, 5);
        setRecentLabels(newLabels);
        localStorage.setItem('bus_recent_labels', JSON.stringify(newLabels));
      }
      alert('標註已儲存！');
      speak('標註已儲存'); // 🔊
      closeModal();
    } catch (e) { alert('儲存失敗'); speak('儲存失敗'); }
  };

  const deleteVideo = async () => {
    speak('確認刪除資料'); // 🔊
    if (!confirm('確定刪除此資料嗎？')) return;
    try {
        await Filesystem.deleteFile({ path: selectedVideo.path, directory: Directory.Data });
        if (selectedVideo.annotations) {
          for (const ann of selectedVideo.annotations) {
            await Filesystem.deleteFile({ path: ann.path, directory: Directory.Data }).catch(()=>{});
          }
        }
        const newVideos = videos.filter(v => v.id !== selectedVideo.id);
        await Filesystem.writeFile({ path: `${FOLDER_NAME}/metadata.json`, data: JSON.stringify(newVideos), directory: Directory.Data, encoding: Encoding.UTF8 });
        setVideos(newVideos);
        closeModal();
        speak('資料已刪除'); // 🔊
    } catch(e) { alert('刪除失敗'); }
  };

  return (
    <div style={{ height: '100%', background: '#222', color: '#fff', overflowY: 'auto', padding: '20px', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>標註資料庫 v2.1 </h2>
        <div style={{ fontSize: '12px', color: '#aaa' }}>共 {videos.length} 筆資料</div>
      </div>
      {videos.map(video => (
        <div key={video.id} onClick={() => handleVideoClick(video)} style={listItemStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold' }}>{video.label || '未標註'}</div>
            {/* 📏 顯示距離數據 */}
            <div style={{ fontSize: '12px', color: '#ccc' }}>📏 距離: {video.distance || 'N/A'}</div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>{video.createdAt}</div>
            {video.annotations && video.annotations.length > 0 && (
              <div style={{fontSize: '11px', color: '#4CAF50', marginTop: '2px'}}>📸 {video.annotations.length} 張截圖</div>
            )}
          </div>
          <FaPlayCircle size={24} />
        </div>
      ))}

      {selectedVideo && (
        <div style={modalOverlayStyle}>
          <div style={{...modalContentStyle, maxHeight: '95vh', overflowY: 'auto'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{viewMode === 'video' ? '預覽影片' : 'AI 標註截圖'}</h3>
              <button onClick={closeModal} style={iconBtnStyle}><FaTimes size={20} /></button>
            </div>

            {viewMode === 'video' ? (
              <>
                <video ref={videoPlayerRef} src={videoUrl} controls crossOrigin="anonymous" style={{ width: '100%', maxHeight: '40vh', background: '#000', marginBottom: '15px', objectFit: 'contain' }} />
                
                {selectedVideo.annotations && selectedVideo.annotations.length > 0 && (
                  <div style={{marginBottom: '15px', padding: '10px', background: '#333', borderRadius: '8px'}}>
                    <div style={{fontSize: '12px', color: '#aaa', marginBottom: '5px'}}>已儲存的截圖 ({selectedVideo.annotations.length})：</div>
                    <div style={{display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px'}}>
                      {selectedVideo.annotations.map((ann, idx) => (
                        <div key={idx} style={{flexShrink: 0, width: '60px', textAlign: 'center'}}>
                          <div style={{width: '60px', height: '60px', background: '#222', borderRadius: '4px', display:'flex', alignItems:'center', justifyContent:'center', border: '1px solid #555'}}>
                            <FaImages size={20} color="#888"/>
                          </div>
                          <div style={{fontSize: '10px', marginTop: '4px', color: '#fff'}}>{ann.label || '#'+(idx+1)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleExport} style={{...actionBtnStyle('#FF9800'), marginBottom: '10px'}}> <FaShareAlt /> 匯出/分享影片 </button>
                <button onClick={captureAndAnnotate} style={actionBtnStyle('#2196F3')}> <FaPen /> 截圖並開始標註 </button>
                <div style={{marginTop: '10px'}}> <button onClick={deleteVideo} style={{...actionBtnStyle('#f44336'), width: '100%'}}> <FaTrash /> 刪除此資料 </button> </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', width: '100%', border: '2px solid #555', borderRadius: '8px', overflow: 'hidden', touchAction: 'none' }}>
                   <img ref={imgRef} src={snapshotUrl} style={{ width: '100%', height: 'auto', display: 'block' }} />
                   <canvas ref={canvasRef} width={imgSize.w} height={imgSize.h} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto' }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} />
                   
                   <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.7)', padding: '6px 12px', borderRadius: '20px', color: '#fff', fontSize: '13px', display: 'flex', alignItems: 'center', borderLeft: isTargetFound ? '4px solid #4CAF50' : '4px solid #FF9800', pointerEvents: 'none' }}>
                     {isTargetFound ? <FaRobot color="#4CAF50" style={{marginRight:'6px'}}/> : <FaExclamationTriangle color="#FF9800" style={{marginRight:'6px'}}/>}
                     {aiStatus}
                   </div>

                   {ocrStatus && (
                     <div style={{ position: 'absolute', top: 50, left: 10, background: 'rgba(33, 150, 243, 0.8)', padding: '4px 10px', borderRadius: '15px', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                       <FaSearch style={{marginRight:'4px'}}/> {ocrStatus}
                     </div>
                   )}

                   {magnifierPos && (
                     <div style={{ position: 'absolute', left: magnifierPos.x - 50, top: magnifierPos.y - 120, width: '100px', height: '100px', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', overflow: 'hidden', pointerEvents: 'none', background: '#000', zIndex: 20 }}>
                       <div style={{ width: '100%', height: '100%', backgroundImage: `url(${snapshotUrl})`, backgroundSize: '300% 300%', backgroundPosition: `${magnifierPos.bgX}% ${magnifierPos.bgY}%` }} />
                     </div>
                   )}
                </div>

                <div style={{ marginTop: '15px' }}>
                  <label style={{display:'block', marginBottom:'5px'}}>公車號碼 (OCR 自動填入)：</label>
                  <input type="text" value={tempLabel} onChange={(e) => setTempLabel(e.target.value)} placeholder="輸入號碼" style={inputStyle} />
                  
                  {recentLabels.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#aaa', display: 'flex', alignItems: 'center' }}><FaHistory style={{marginRight:'4px'}}/> 最近:</span>
                      {recentLabels.map(label => (
                        <button key={label} onClick={() => setTempLabel(label)} style={{ background: '#444', border: '1px solid #666', color: '#fff', padding: '4px 10px', borderRadius: '15px', fontSize: '14px' }}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                   <button onClick={() => { speak('取消'); setViewMode('video'); }} style={{...actionBtnStyle('#555'), flex: 1}}>取消</button>
                   <button onClick={saveAnnotation} style={{...actionBtnStyle('#4CAF50'), flex: 2}}> <FaSave /> 儲存標註</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const listItemStyle = { display: 'flex', alignItems: 'center', background: '#333', padding: '15px', borderRadius: '8px', marginBottom: '10px', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContentStyle = { background: '#222', width: '95%', maxWidth: '400px', padding: '20px', borderRadius: '12px', color: '#fff' };
const iconBtnStyle = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer' };
const actionBtnStyle = (bg) => ({ padding: '12px', border: 'none', borderRadius: '6px', background: bg, color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontSize: '16px', width: '100%' });
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #555', background: '#333', color: '#fff', fontSize: '16px' };