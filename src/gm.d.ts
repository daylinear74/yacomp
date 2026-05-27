declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_registerMenuCommand(caption: string, onClick: () => void): void;
