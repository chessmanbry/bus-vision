import { useState, useRef, useEffect } from 'react';
import { recognizeBus, getBusInfo } from './api';

// 簡單的語音播報工具
function speakText(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    alert('此瀏覽器不支援語音播報');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  window.speechSynthesis.speak(utterance);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); // upload | camera

  // 共用狀態
  const [recognizeResult, setRecognizeResult] = useState(null);
  const [busInfo, setBusInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // 上傳模式相關
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [routeInput, setRouteInput] = useState('');

  // 拍照模式相關
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturePreview, setCapturePreview] = useState(null);

  // 按下鍵盤 r / R 進行報讀
  useEffect(() => {
    function handleKeydown(e) {
      // 避免在輸入框打字時誤觸
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'r' || e.key === 'R') {
        // 先報讀公車資訊，如果有的話
        if (busInfo) {
          const text = `${busInfo.route}，${busInfo.direction}，下一站 ${
            busInfo.nextStop
          }，預估 ${busInfo.arrivalTime} 抵達。`;
          speakText(text);
        } else if (recognizeResult && recognizeResult.busNumbers) {
          // 否則報讀辨識結果
          const numbers = recognizeResult.busNumbers
            .map(
              (b) => `${b.number}，信心值 ${Math.round(b.confidence * 100)}%`
            )
            .join('；');
          const text = `辨識到的公車路線有：${numbers}`;
          speakText(text);
        } else {
          //什麼都沒有
          speakText('目前沒有可以報讀的內容');
        }
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [recognizeResult, busInfo]);

  // -------- 上傳照片模式 --------
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setRecognizeResult(null);
    setBusInfo(null);

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const handleRecognizeUpload = async () => {
    if (!imageFile) {
      alert('請先選擇一張照片');
      return;
    }

    try {
      setLoading(true);
      setRecognizeResult(null);
      setBusInfo(null);

      const data = await recognizeBus(imageFile);
      setRecognizeResult(data);

      if (data.busNumbers && data.busNumbers.length > 0) {
        const firstRoute = data.busNumbers[0].number;
        setRouteInput(firstRoute);
        const info = await getBusInfo(firstRoute);
        setBusInfo(info);
      }
    } catch (err) {
      console.error(err);
      alert('辨識失敗，請查看 console');
    } finally {
      setLoading(false);
    }
  };

  // -------- 拍照模式：開關相機 + 拍照 + 辨識 --------
  const handleOpenCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('此裝置或瀏覽器不支援相機');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // 優先使用後鏡頭（手機）
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        streamRef.current = stream;
        setCameraReady(true);
      }
    } catch (err) {
      console.error(err);
      alert('開啟相機失敗，請檢查權限設定');
    }
  };

  const handleCloseCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  };

  const handleCaptureAndRecognize = async () => {
    if (!videoRef.current) return;

    try {
      setLoading(true);
      setRecognizeResult(null);
      setBusInfo(null);

      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 預覽用
      const dataUrl = canvas.toDataURL('image/png');
      setCapturePreview(dataUrl);

      // 上傳用 Blob
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (!blob) {
        alert('擷取圖片失敗');
        return;
      }

      const data = await recognizeBus(blob);
      setRecognizeResult(data);

      if (data.busNumbers && data.busNumbers.length > 0) {
        const firstRoute = data.busNumbers[0].number;
        setRouteInput(firstRoute);
        const info = await getBusInfo(firstRoute);
        setBusInfo(info);
      }
    } catch (err) {
      console.error(err);
      alert('拍照辨識失敗，請查看 console');
    } finally {
      setLoading(false);
    }
  };

  // -------- 報讀相關 --------
  const handleSpeakRecognize = () => {
    if (!recognizeResult || !recognizeResult.busNumbers) {
      alert('目前沒有辨識結果可以報讀');
      return;
    }
    const numbers = recognizeResult.busNumbers
      .map((b) => `${b.number}，信心值 ${Math.round(b.confidence * 100)}%`)
      .join('；');
    const text = `辨識到的公車路線有：${numbers}`;
    speakText(text);
  };

  const handleSpeakBusInfo = () => {
    if (!busInfo) {
      alert('目前沒有公車資訊可以報讀');
      return;
    }
    const text = `${busInfo.route}，${busInfo.direction}，下一站 ${busInfo.nextStop}，預估 ${busInfo.arrivalTime} 抵達。`;
    speakText(text);
  };

  // -------- UI Rendering --------

  const renderUploadTab = () => (
    <>
      {/* 上傳區 */}
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>上傳照片辨識</h2>
        <input type="file" accept="image/*" onChange={handleImageChange} />

        {imagePreview && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ marginBottom: '4px' }}>預覽：</div>
            <img
              src={imagePreview}
              alt="preview"
              style={{ maxWidth: '100%', borderRadius: '8px' }}
            />
          </div>
        )}

        <button
          onClick={handleRecognizeUpload}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: '#38bdf8',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          disabled={loading}
        >
          {loading ? '處理中...' : '上傳並辨識公車號碼'}
        </button>
      </div>
    </>
  );

  const renderCameraTab = () => (
    <>
      {/* 拍照區 */}
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>拍照即時辨識</h2>

        <div style={{ marginBottom: '8px' }}>
          {!cameraReady ? (
            <button
              onClick={handleOpenCamera}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#22c55e',
                cursor: 'pointer',
                fontWeight: 600,
                marginRight: '8px',
              }}
            >
              開啟相機
            </button>
          ) : (
            <button
              onClick={handleCloseCamera}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#ef4444',
                cursor: 'pointer',
                fontWeight: 600,
                marginRight: '8px',
              }}
            >
              關閉相機
            </button>
          )}

          <button
            onClick={handleCaptureAndRecognize}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#38bdf8',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            disabled={!cameraReady || loading}
          >
            {loading ? '處理中...' : '拍照並辨識'}
          </button>
        </div>

        <div>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              maxWidth: '480px',
              borderRadius: '8px',
              background: '#020617',
            }}
            playsInline
            muted
          />
        </div>

        {capturePreview && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ marginBottom: '4px' }}>最後一次拍照畫面：</div>
            <img
              src={capturePreview}
              alt="capture"
              style={{ maxWidth: '100%', borderRadius: '8px' }}
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: 'white',
        padding: '16px',
        paddingBottom: '80px', // 預留底部選單空間
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>
        公車號碼辨識 APP Demo
      </h1>

      {/* 分頁內容 */}
      {activeTab === 'upload' ? renderUploadTab() : renderCameraTab()}

      {/* 辨識結果 + 報讀 */}
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>辨識結果</h2>
        {recognizeResult ? (
          <>
            <div style={{ marginBottom: '8px' }}>後端回傳 JSON：</div>
            <pre
              style={{
                background: '#020617',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(recognizeResult, null, 2)}
            </pre>
            <button
              onClick={handleSpeakRecognize}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#a855f7',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              報讀辨識結果
            </button>
          </>
        ) : (
          <div style={{ color: '#64748b' }}>尚未有辨識結果</div>
        )}
      </div>

      {/* 公車資訊 + 報讀 */}
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
        }}
      >
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>公車資訊</h2>
        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="輸入路線，例如 941 或 251"
            value={routeInput}
            onChange={(e) => setRouteInput(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #334155',
              width: '220px',
              marginRight: '8px',
            }}
          />
          <button
            onClick={async () => {
              if (!routeInput.trim()) {
                alert('請先輸入路線');
                return;
              }
              try {
                setLoading(true);
                const info = await getBusInfo(routeInput.trim());
                setBusInfo(info);
              } catch (err) {
                console.error(err);
                alert('查詢公車資訊失敗');
              } finally {
                setLoading(false);
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#4ade80',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            disabled={loading}
          >
            查詢
          </button>
        </div>

        {busInfo ? (
          <>
            <pre
              style={{
                background: '#020617',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(busInfo, null, 2)}
            </pre>
            <button
              onClick={handleSpeakBusInfo}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#f97316',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              報讀公車資訊
            </button>
          </>
        ) : (
          <div style={{ color: '#64748b' }}>尚未查詢公車資訊</div>
        )}
      </div>

      {/* 底部選單 */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '56px',
          background: '#020617',
          borderTop: '1px solid #1e293b',
          display: 'flex',
        }}
      >
        <button
          onClick={() => setActiveTab('upload')}
          style={{
            flex: 1,
            border: 'none',
            background: activeTab === 'upload' ? '#1e293b' : 'transparent',
            color: 'white',
            fontWeight: activeTab === 'upload' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          上傳辨識
        </button>
        <button
          onClick={() => setActiveTab('camera')}
          style={{
            flex: 1,
            border: 'none',
            background: activeTab === 'camera' ? '#1e293b' : 'transparent',
            color: 'white',
            fontWeight: activeTab === 'camera' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          拍照辨識
        </button>
      </div>
    </div>
  );
}
