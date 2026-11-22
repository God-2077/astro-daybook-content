import simdWasmUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';
import wasmUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import encode, { init } from '@jsquash/webp/encode.js';
import type { ConvertRequest, ConvertResponse } from './types';

const scope = self as unknown as {
  postMessage: (message: ConvertResponse, transfer?: Transferable[]) => void;
};

const post = scope.postMessage.bind(scope);

let encoder: Promise<unknown> | null = null;

function getEncoder(): Promise<unknown> {
  encoder ??= init({
    locateFile: (path: string) => (path.includes('simd') ? simdWasmUrl : wasmUrl),
  });

  return encoder;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function convert({ id, file, quality, effort }: ConvertRequest): Promise<void> {
  try {
    await getEncoder();
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    try {
      const { width, height } = bitmap;

      if (!width || !height) {
        throw new Error('图片尺寸为空');
      }

      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('这个浏览器不支持 Canvas 2D');
      }

      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, width, height);
      const buffer = await encode(imageData, {
        quality: clampInteger(quality, 1, 100),
        method: clampInteger(effort, 0, 6),
      });

      post({ id, ok: true, buffer, width, height }, [buffer]);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    post({
      id,
      ok: false,
      error: error instanceof Error ? `转换失败：${error.message}` : '转换失败',
    });
  }
}

self.addEventListener('message', (event: MessageEvent<ConvertRequest>) => {
  void convert(event.data);
});