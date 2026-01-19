const BASE_URL = 'http://localhost:3000';

/**
 * 傳入 File 或 Blob 都可以
 * 拍照截圖會是 Blob，上傳相片會是 File
 */
export async function recognizeBus(image) {
  const formData = new FormData();
  // 第三個參數是檔名，Blob 沒有 name，我們給預設值
  const filename = image.name || 'capture.png';
  formData.append('image', image, filename);

  const res = await fetch(`${BASE_URL}/api/recognize-bus`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`辨識 API 失敗，狀態碼：${res.status}`);
  }

  return res.json();
}

export async function getBusInfo(route) {
  const res = await fetch(
    `${BASE_URL}/api/bus-info?route=${encodeURIComponent(route)}`
  );

  if (!res.ok) {
    throw new Error(`公車資訊 API 失敗，狀態碼：${res.status}`);
  }

  return res.json();
}
