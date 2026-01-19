console.log('✅ index.js 開始執行');

const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 啟用 CORS，讓前端可以呼叫
app.use(cors({
  origin: 'http://localhost:5173',
}));
app.use(express.json());

// 測試用首頁
app.get('/', (req, res) => {
  res.send('Hello from bus-vision backend!');
});

// 上傳圖片用的記憶體儲存
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 偵測公車號碼 API（先回傳假資料）
 * POST /api/recognize-bus
 * form-data: image (file)
 */
app.post('/api/recognize-bus', upload.single('image'), async (req, res) => {
  console.log('📸 收到 /api/recognize-bus 請求');

  if (!req.file) {
    return res.status(400).json({ error: '沒有收到圖片 image' });
  }

  // TODO: 之後在這裡接 YOLO / OCR
  res.json({
    success: true,
    busNumbers: [
      { number: '941', confidence: 0.95 },
      { number: '251', confidence: 0.82 },
    ],
    msg: "後端測試假資料",
  });
});

/**
 * 查詢公車資訊 API（先回傳假資料）
 * GET /api/bus-info?route=941
 */
app.get('/api/bus-info', (req, res) => {
  console.log('🚌 收到 /api/bus-info 請求');

  const route = req.query.route || '未知';

  // TODO: 之後在這裡接真正的公車 API
  res.json({
    route,
    direction: '往三峽',
    nextStop: '捷運七張站',
    arrivalTime: '3 分鐘',
    msg: '後端測試假資料',
  });
});

// 啟動 server
app.listen(PORT, () => {
  console.log(`✅ Backend server running at http://localhost:${PORT}`);
});
