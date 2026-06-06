declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_registerMenuCommand(caption: string, onClick: () => void): void;

interface GMXHRResponse {
  status: number;
  responseText: string;
  finalUrl?: string;
}
interface GMXHRDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  onload?: (response: GMXHRResponse) => void;
  onerror?: (response: GMXHRResponse | Error) => void;
  ontimeout?: () => void;
}
declare function GM_xmlhttpRequest(details: GMXHRDetails): void;
