import { useState, useRef, useEffect } from 'react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { App as CapacitorApp } from '@capacitor/app';

const METADATA_FILE = 'BusData/metadata.json';
const FOLDER_NAME = 'BusData';

export default function Recorder() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(null);
  
  // 使用 Ref 存影片片段，避免閉包陷阱
  const videoChunksRef = useRef([]); 
  
  const [status, setStatus] = useState('初始化相機...');
  const [timer, setTimer] = useState(0);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isNightMode, setIsNightMode] = useState(false); 
  const isNightModeRef = useRef(false);
  const brightnessIntervalRef = useRef(null);

  const [currentHeading, setCurrentHeading] = useState(0);
  const [recordedGeoData, setRecordedGeoData] = useState(null);
  
  // 📏 新增：距離數據狀態
  const [focusDist, setFocusDist] = useState('N/A');

  // 🗣️ 語音報讀函式
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // 打斷上一句
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW'; // 設定中文
      utterance.rate = 1.0;     // 語速
      window.speechSynthesis.speak(utterance);
    }
  };

  const checkAndCreateDir = async () => {
    try {
      await Filesystem.mkdir({ path: FOLDER_NAME, directory: Directory.Data, recursive: true });
    } catch (e) {}
  };

  // 🛑 停止相機 (釋放資源)
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (brightnessIntervalRef.current) {
      clearInterval(brightnessIntervalRef.current);
      brightnessIntervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // ▶️ 啟動相機
  const startCamera = async () => {
    stopCamera();

    try {
      const constraints = {
        audio: true, // 🎙️ 關鍵：開啟錄音
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          zoom: true,
          exposureMode: 'continuous',
          focusMode: 'continuous'
        }
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      // 等待 video 元素準備好
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(e => console.log('Play error:', e));
        };
      }
      
      startSmartExposure(mediaStream);
      try { await Geolocation.checkPermissions(); } catch (e) {}
      setStatus('準備就緒');
      speak('相機已啟動'); // 🔊 語音回饋
    } catch (err) {
      setStatus(`相機重啟失敗: ${err.message}`);
      speak('相機啟動失敗');
    }
  };

  // 👂 監聽 App 狀態 (背景/前景切換) - 防卡死
  useEffect(() => {
    let appListener;

    const setupListener = async () => {
      appListener = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // ☀️ App 回到前台：重新啟動相機
          setStatus('正在喚醒相機...');
          speak('回到程式，正在喚醒相機');
          setTimeout(() => startCamera(), 500);
        } else {
          // 🌙 App 進入後台：強制停止錄影與相機
          if (recording) {
            stopRecording(); // 如果正在錄，先存檔
          }
          stopCamera(); // 釋放相機資源
        }
      });
    };

    setupListener();

    // 啟動時先開一次
    startCamera();

    return () => {
      if (appListener) appListener.remove();
      stopCamera();
    };
  }, []);

  useEffect(() => {
    const handleOrientation = (event) => {
      if (event.alpha !== null) setCurrentHeading(Math.round(event.alpha));
    };
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  const startSmartExposure = (mediaStream) => {
    if (brightnessIntervalRef.current) clearInterval(brightnessIntervalRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 50; canvas.height = 50;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    brightnessIntervalRef.current = setInterval(() => {
      if (!videoRef.current) return;
      try {
        ctx.drawImage(videoRef.current, 0, 0, 50, 50);
        const frame = ctx.getImageData(0, 0, 50, 50);
        const data = frame.data;
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 16) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 16);
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        // 📏 嘗試讀取對焦距離
        const settings = track.getSettings();
        if (settings.focusDistance) {
            setFocusDist(settings.focusDistance.toFixed(2) + 'm');
        } else {
            setFocusDist('N/A');
        }

        if ('exposureCompensation' in capabilities) {
          let targetEV = 0;
          let shouldBeNight = isNightModeRef.current;
          if (isNightModeRef.current) {
            if (avgBrightness > 45) { shouldBeNight = false; targetEV = 0; }
          } else {
            if (avgBrightness < 40) { shouldBeNight = true; targetEV = -2.0; }
          }
          if (shouldBeNight !== isNightModeRef.current) {
             track.applyConstraints({ advanced: [{ exposureCompensation: targetEV }] }).catch(e => {});
             isNightModeRef.current = shouldBeNight;
             setIsNightMode(shouldBeNight);
             speak(shouldBeNight ? '切換至夜間模式' : '切換至日間模式');
          }
        }
      } catch (e) {}
    }, 500);
  };

  const handleZoom = async (level) => {
    speak(`切換變焦 ${level}倍`); // 🔊
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    if ('zoom' in capabilities) {
      try {
        const targetZoom = Math.min(level, capabilities.zoom.max);
        await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
        setZoomLevel(targetZoom);
      } catch (e) {}
    } else {
      setZoomLevel(level);
    }
  };

  const startRecording = async () => {
    speak('開始錄影'); // 🔊
    if (!stream) return;
    await checkAndCreateDir();
    setStatus('定位中...');
    let geoInfo = null;
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 3000 });
      geoInfo = { lat: position.coords.latitude, lng: position.coords.longitude, heading: currentHeading, accuracy: position.coords.accuracy };
    } catch (e) {
      geoInfo = { error: 'Timeout', heading: currentHeading };
    }
    setRecordedGeoData(geoInfo);

    const options = { mimeType: 'video/mp4', videoBitsPerSecond: 1500000 };
    try {
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      videoChunksRef.current = []; // 清空 Ref
      
      recorder.ondataavailable = (e) => { 
        if (e.data && e.data.size > 0) {
          videoChunksRef.current.push(e.data); // 同步寫入 Ref
        }
      };
      
      recorder.onstop = saveVideo;
      
      recorder.start(1000); // 每一秒存一次，防止最後遺失
      
      setRecording(true);
      setStatus(isNightMode ? '🔴 錄影中 (夜間模式)' : '🔴 錄影中 (日間模式)');
    } catch (e) {
       alert('錄影失敗');
       speak('錄影失敗');
    }
  };

  const stopRecording = () => {
    speak('停止錄影，正在儲存'); // 🔊
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // 狀態更新稍微延後，等待 onstop 觸發
      setTimeout(() => {
        setRecording(false);
        setProgress(0);
        setStatus('準備儲存...');
      }, 100);
    }
  };

  const readMetadata = async () => {
    try {
      const contents = await Filesystem.readFile({ path: `${FOLDER_NAME}/metadata.json`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(contents.data);
    } catch (error) { return []; }
  };

  const saveVideo = async () => {
    const chunks = videoChunksRef.current;
    if (chunks.length === 0) { setStatus('❌ 無資料'); setProgress(null); return; }
    
    try {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const timestamp = Date.now();
      const fileName = `Bus_${timestamp}.mp4`;
      const fullPath = `${FOLDER_NAME}/${fileName}`;

      setStatus('處理中...');
      const reader = new FileReader();
      reader.onprogress = (data) => {
        if (data.lengthComputable && data.total > 0) {
          const percent = Math.round((data.loaded / data.total) * 50);
          setProgress(percent);
        }
      };
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result;
        if (!base64data) { setProgress(null); return; }
        try {
          setStatus('寫入中...');
          setProgress(55);
          await Filesystem.writeFile({ path: fullPath, data: base64data, directory: Directory.Data });
          setProgress(85);
          const currentData = await readMetadata();
          
          const newItem = {
            id: timestamp, 
            filename: fileName, 
            path: fullPath, 
            label: '',
            createdAt: new Date().toLocaleString(), 
            location: recordedGeoData || { error: 'No Data' },
            distance: focusDist, // 📏 儲存距離
            timeOfDay: isNightMode ? 'night' : 'day',
            hasSnapshot: false, 
            snapshotPath: '', 
            annotations: [] 
          };
          
          currentData.unshift(newItem);
          await Filesystem.writeFile({ path: `${FOLDER_NAME}/metadata.json`, data: JSON.stringify(currentData), directory: Directory.Data, encoding: Encoding.UTF8 });
          setProgress(100);
          setStatus(`✅ 儲存成功！`);
          speak('影片儲存成功'); // 🔊
          setTimeout(() => { setProgress(null); setTimer(0); setStatus('準備就緒'); }, 1500);
        } catch (error) { setStatus(`❌ 失敗`); setProgress(null); speak('儲存失敗'); }
      };
    } catch (e) { setProgress(null); }
  };

  useEffect(() => {
    let interval = null;
    if (recording) { interval = setInterval(() => setTimer(s => s + 1), 1000); } 
    else { clearInterval(interval); }
    return () => clearInterval(interval);
  }, [recording]);

  const isHardwareZoomSupported = stream && stream.getVideoTracks()[0].getCapabilities && 'zoom' in stream.getVideoTracks()[0].getCapabilities();
  const videoStyle = {
    width: '100%', height: '100%', objectFit: 'cover',
    transform: isHardwareZoomSupported ? 'none' : `scale(${zoomLevel})`,
    transformOrigin: 'center center',
    transition: 'transform 0.2s ease-out',
    filter: 'contrast(1.1)' 
  };

  const getCompassDirection = (deg) => {
    const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    return directions[Math.round(deg / 45) % 8];
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
        <div style={{ position: 'absolute', top: 40, left: 20, display:'flex', flexDirection:'column', gap:'5px', zIndex: 10 }}>
          <div style={{ background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '8px', color: 'white', fontSize: '14px' }}>{status}</div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <div style={{ background: isNightMode ? 'rgba(50, 50, 255, 0.6)' : 'rgba(255, 165, 0, 0.6)', padding: '4px 8px', borderRadius: '8px', color: 'white', fontSize: '12px' }}>{isNightMode ? '🌙 夜間' : '☀️ 日間'}</div>
            <div style={{ background: 'rgba(0, 128, 0, 0.6)', padding: '4px 8px', borderRadius: '8px', color: 'white', fontSize: '12px' }}>🧭 {currentHeading}° {getCompassDirection(currentHeading)}</div>
            {/* 📏 顯示距離數據 */}
            <div style={{ background: 'rgba(128, 0, 128, 0.6)', padding: '4px 8px', borderRadius: '8px', color: 'white', fontSize: '12px' }}>📏 {focusDist}</div>
          </div>
          {recording && <div style={{ color: '#ff4444', fontWeight: 'bold', fontSize: '20px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>REC {new Date(timer * 1000).toISOString().substr(14, 5)}</div>}
        </div>
        <div style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 20 }}>
           {[1, 2, 3, 4, 5].map(level => (
             <button key={level} onClick={() => handleZoom(level)} style={{ width: '45px', height: '45px', borderRadius: '50%', background: zoomLevel === level ? 'rgba(255, 204, 0, 0.9)' : 'rgba(0,0,0,0.4)', color: zoomLevel === level ? '#000' : '#fff', border: '2px solid #fff', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 8px rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}>{level}x</button>
           ))}
        </div>
        {progress !== null && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 40px' }}>
            <div style={{ width: '100%', color: '#4da3ff', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>儲存中...</span><span>{progress}%</span></div>
            <div style={{ width: '100%', height: '12px', background: '#333', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4da3ff, #00d2ff)', transition: 'width 0.3s ease' }}></div></div>
          </div>
        )}
      </div>
      <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
        {!recording ? (
          <button onClick={startRecording} disabled={progress !== null} style={{ width: '70px', height: '70px', borderRadius: '50%', border: '4px solid white', background: progress !== null ? '#555' : '#ff4444', opacity: progress !== null ? 0.5 : 1 }} />
        ) : (
          <button onClick={stopRecording} style={{ width: '70px', height: '70px', borderRadius: '8px', border: 'none', background: 'white' }} />
        )}
      </div>
    </div>
  );
}