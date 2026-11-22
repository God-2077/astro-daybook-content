import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import type { ConvertResponse } from './types';

type Status = 'queued' | 'converting' | 'done' | 'error';

type Item = {
  id: number;
  file: File;
  status: Status;
  originalUrl: string;
  quality: number;
  effort: number;
  valid: boolean;
  webpUrl?: string;
  webpBlob?: Blob;
  width?: number;
  height?: number;
  error?: string;
  thumbBroken?: boolean;
};

const MAX_BYTES = 50 * 1024 * 1024;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];

  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

function savingsLabel(originalSize: number, outputSize: number): string {
  if (originalSize <= 0) return '';

  const difference = originalSize - outputSize;
  const percent = (Math.abs(difference) / originalSize) * 100;

  if (percent < 0.05) return '大小相近';

  const digits = percent >= 10 ? 0 : 1;
  return difference > 0
    ? `节省 ${percent.toFixed(digits)}%`
    : `增大 ${percent.toFixed(digits)}%`;
}

function toWebpName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.webp`;
}

function statusLabel(status: Status): string {
  const labels: Record<Status, string> = {
    queued: '排队中',
    converting: '转换中…',
    done: '已转换',
    error: '失败',
  };
  return labels[status];
}

function uniqueDownloadName(name: string, used: Set<string>): string {
  let candidate = name;
  let index = 1;

  while (used.has(candidate.toLowerCase())) {
    candidate = name.replace(/\.webp$/i, `-${index}.webp`);
    index += 1;
  }

  used.add(candidate.toLowerCase());
  return candidate;
}

function triggerDownload(item: Item, filename = toWebpName(item.file.name)): void {
  if (!item.webpUrl) return;

  const link = document.createElement('a');
  link.href = item.webpUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export default function WebpConverter() {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(75);
  const [effort, setEffort] = useState(4);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [queueTick, setQueueTick] = useState(0);

  const itemsRef = useRef<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (response: ConvertResponse) => void>());
  const nextIdRef = useRef(1);
  const processingRef = useRef(false);
  const downloadingRef = useRef(false);

  const commitItems = useCallback((updater: (current: Item[]) => Item[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);

    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      processingRef.current = false;

      const pending = [...pendingRef.current.values()];
      pendingRef.current.clear();
      for (const resolve of pending) {
        resolve({ id: 0, ok: false, error: '页面已关闭' });
      }

      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.originalUrl);
        if (item.webpUrl) URL.revokeObjectURL(item.webpUrl);
      }
      itemsRef.current = [];
    };
  }, []);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<ConvertResponse>) => {
      const resolve = pendingRef.current.get(event.data.id);
      if (!resolve) return;
      pendingRef.current.delete(event.data.id);
      resolve(event.data);
    });

    worker.addEventListener('error', () => {
      const pending = [...pendingRef.current.values()];
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;

      for (const resolve of pending) {
        resolve({ id: 0, ok: false, error: '转换器加载失败，请刷新页面重试' });
      }
    });

    workerRef.current = worker;
    return worker;
  }, []);

  const convert = useCallback(
    (item: Item): Promise<ConvertResponse> => {
      return new Promise((resolve) => {
        pendingRef.current.set(item.id, resolve);

        try {
          getWorker().postMessage({
            id: item.id,
            file: item.file,
            quality: item.quality,
            effort: item.effort,
          });
        } catch {
          pendingRef.current.delete(item.id);
          resolve({ id: item.id, ok: false, error: '无法启动转换器' });
        }
      });
    },
    [getWorker],
  );

  useEffect(() => {
    if (processingRef.current) return;

    const next = items.find((item) => item.status === 'queued');
    if (!next) return;

    processingRef.current = true;
    commitItems((current) =>
      current.map((item) => (item.id === next.id ? { ...item, status: 'converting' } : item)),
    );

    void (async () => {
      try {
        const response = await convert(next);
        if (!itemsRef.current.some((item) => item.id === next.id)) return;

        if (response.ok) {
          const blob = new Blob([response.buffer], { type: 'image/webp' });
          const webpUrl = URL.createObjectURL(blob);

          commitItems((current) =>
            current.map((item) =>
              item.id === next.id
                ? {
                    ...item,
                    webpBlob: blob,
                    webpUrl,
                    width: response.width,
                    height: response.height,
                    status: 'done',
                    error: undefined,
                  }
                : item,
            ),
          );
        } else {
          commitItems((current) =>
            current.map((item) =>
              item.id === next.id ? { ...item, status: 'error', error: response.error } : item,
            ),
          );
        }
      } finally {
        processingRef.current = false;
        setQueueTick((tick) => tick + 1);
      }
    })();
  }, [items, queueTick, commitItems, convert]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextQuality = clamp(quality, 1, 100);
      const nextEffort = clamp(effort, 0, 6);

      const additions = files.map((file): Item => {
        let status: Status = 'queued';
        let error: string | undefined;
        let valid = true;

        if (!file.type.startsWith('image/') && file.type !== '') {
          status = 'error';
          error = '这不是浏览器支持的图片文件';
          valid = false;
        } else if (file.size === 0) {
          status = 'error';
          error = '文件是空的';
          valid = false;
        } else if (file.size > MAX_BYTES) {
          status = 'error';
          error = '文件超过 50 MB';
          valid = false;
        }

        return {
          id: nextIdRef.current++,
          file,
          status,
          originalUrl: URL.createObjectURL(file),
          quality: nextQuality,
          effort: nextEffort,
          valid,
          error,
        };
      });

      commitItems((current) => [...current, ...additions]);
    },
    [commitItems, quality, effort],
  );

  const markThumbBroken = useCallback(
    (id: number) => {
      commitItems((current) =>
        current.map((item) => (item.id === id ? { ...item, thumbBroken: true } : item)),
      );
    },
    [commitItems],
  );

  const removeItem = (id: number) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;

    URL.revokeObjectURL(item.originalUrl);
    if (item.webpUrl) URL.revokeObjectURL(item.webpUrl);
    commitItems((current) => current.filter((candidate) => candidate.id !== id));
  };

  const clearAll = () => {
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.originalUrl);
      if (item.webpUrl) URL.revokeObjectURL(item.webpUrl);
    }
    commitItems(() => []);
  };

  const reconvertAll = () => {
    const nextQuality = clamp(quality, 1, 100);
    const nextEffort = clamp(effort, 0, 6);

    for (const item of itemsRef.current) {
      if (item.webpUrl) URL.revokeObjectURL(item.webpUrl);
    }

    commitItems((current) =>
      current.map((item) =>
        item.valid
          ? {
              ...item,
              webpUrl: undefined,
              webpBlob: undefined,
              width: undefined,
              height: undefined,
              error: undefined,
              quality: nextQuality,
              effort: nextEffort,
              status: 'queued',
            }
          : item,
      ),
    );
  };

  const downloadAll = async () => {
    if (downloadingRef.current) return;

    const done = itemsRef.current.filter((item) => item.status === 'done' && item.webpUrl);
    if (done.length === 0) return;

    downloadingRef.current = true;
    setDownloading(true);

    const usedNames = new Set<string>();

    try {
      for (let index = 0; index < done.length; index += 1) {
        const filename = uniqueDownloadName(toWebpName(done[index].file.name), usedNames);
        triggerDownload(done[index], filename);

        if (index < done.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  const { summary, doneCount, busy } = useMemo(() => {
    const done = items.filter((item) => item.status === 'done');
    const failed = items.filter((item) => item.status === 'error');
    const active = items.some(
      (item) => item.status === 'queued' || item.status === 'converting',
    );

    if (items.length === 0) {
      return { summary: '还没有图片', doneCount: 0, busy: false };
    }

    if (active) {
      return {
        summary: `处理中 · 已完成 ${done.length}/${items.length}`,
        doneCount: done.length,
        busy: true,
      };
    }

    if (done.length > 0) {
      const originalSize = done.reduce((total, item) => total + item.file.size, 0);
      const outputSize = done.reduce((total, item) => total + (item.webpBlob?.size ?? 0), 0);
      const failure = failed.length > 0 ? ` · ${failed.length} 张失败` : '';

      return {
        summary: `已转换 ${done.length}/${items.length} 张 · ${formatBytes(originalSize)} → ${formatBytes(outputSize)} · ${savingsLabel(originalSize, outputSize)}${failure}`,
        doneCount: done.length,
        busy: false,
      };
    }

    if (failed.length > 0) {
      return { summary: `${failed.length} 张转换失败`, doneCount: 0, busy: false };
    }

    return { summary: '还没有图片', doneCount: 0, busy: false };
  }, [items]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = '';
    addFiles(files);
  };

  const openPicker = () => inputRef.current?.click();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files ? Array.from(event.dataTransfer.files) : []);
  };

  return (
    <section className="a-webp" data-pagefind-ignore>
      <div className="a-webp-settings">
        <label className="a-webp-field">
          <span className="a-webp-field-head">
            <span>Quality</span>
            <output className="a-webp-value">{quality}</output>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            onChange={(event) => setQuality(clamp(Number(event.currentTarget.value), 1, 100))}
          />
          <span className="a-webp-hint">数值越高画质越好，文件也越大</span>
        </label>
        <label className="a-webp-field">
          <span className="a-webp-field-head">
            <span>Effort</span>
            <output className="a-webp-value">{effort}</output>
          </span>
          <input
            type="range"
            min={0}
            max={6}
            step={1}
            value={effort}
            onChange={(event) => setEffort(clamp(Number(event.currentTarget.value), 0, 6))}
          />
          <span className="a-webp-hint">0–6，越高压缩越慢，通常文件更小</span>
        </label>
      </div>

      <div
        className={`a-webp-drop${dragging ? ' is-drag' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="选择图片，或把图片拖到这里"
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="a-webp-mark" aria-hidden="true">
          ✦
        </span>
        <strong className="a-webp-drop-title">把图片拖到这里</strong>
        <span className="a-webp-hint">
          或点击选择 · 支持 JPG / PNG / WebP / AVIF / GIF（首帧）· 单张不超过 50 MB
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleInputChange}
      />

      <div className="a-webp-toolbar">
        <p className="a-webp-summary" aria-live="polite">
          {summary}
        </p>
        <div className="a-webp-actions">
          <button
            type="button"
            className="a-btn a-btn-ghost a-webp-btn"
            disabled={items.length === 0 || downloading}
            onClick={clearAll}
          >
            清空
          </button>
          <button
            type="button"
            className="a-btn a-btn-ghost a-webp-btn"
            disabled={items.length === 0 || busy || downloading}
            onClick={reconvertAll}
          >
            用当前参数重转
          </button>
          <button
            type="button"
            className="a-btn a-btn-primary a-webp-btn"
            disabled={doneCount === 0 || downloading}
            onClick={() => void downloadAll()}
          >
            全部下载
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="a-webp-list">
          {items.map((item) => (
            <li className="a-webp-item" data-status={item.status} key={item.id}>
              <div className="a-webp-thumb">
                {item.thumbBroken ? (
                  <span className="a-webp-thumb-mark" aria-hidden="true">
                    ✦
                  </span>
                ) : (
                  <img
                    src={item.originalUrl}
                    alt=""
                    loading="lazy"
                    onError={() => markThumbBroken(item.id)}
                  />
                )}
              </div>
              <div className="a-webp-body">
                <p className="a-webp-name" title={item.file.name}>
                  {item.file.name}
                </p>
                <p className="a-webp-meta">
                  {formatBytes(item.file.size)} · Q{item.quality} · E{item.effort}
                </p>
                {item.status === 'done' && item.webpBlob && (
                  <p className="a-webp-result">
                    WebP {formatBytes(item.webpBlob.size)} ·{' '}
                    {savingsLabel(item.file.size, item.webpBlob.size)}
                    {item.width && item.height ? ` · ${item.width} × ${item.height}` : ''}
                  </p>
                )}
                {item.status === 'error' && (
                  <p className="a-webp-error">{item.error ?? '转换失败'}</p>
                )}
              </div>
              <div className="a-webp-item-actions">
                <span className="a-webp-badge">{statusLabel(item.status)}</span>
                {item.status === 'done' && item.webpUrl && (
                  <a
                    className="a-btn a-btn-ghost a-webp-btn a-webp-btn-sm"
                    href={item.webpUrl}
                    download={toWebpName(item.file.name)}
                  >
                    下载
                  </a>
                )}
                <button
                  type="button"
                  className="a-btn a-btn-ghost a-webp-btn a-webp-btn-sm"
                  onClick={() => removeItem(item.id)}
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}