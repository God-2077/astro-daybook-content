export type ConvertRequest = {
  id: number;
  file: File;
  quality: number;
  effort: number;
};

export type ConvertResponse =
  | {
      id: number;
      ok: true;
      buffer: ArrayBuffer;
      width: number;
      height: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };