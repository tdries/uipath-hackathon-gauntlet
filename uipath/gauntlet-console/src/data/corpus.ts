import corpusRaw from "./corpus.json";
import type { FightRecord } from "./types";

export const corpus = corpusRaw as unknown as FightRecord[];
