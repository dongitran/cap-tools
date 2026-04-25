import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface HanaTableDisplayEntry {
  readonly name: string;
  readonly displayName: string;
}

interface WordsNinjaInstance {
  loadDictionary(): Promise<unknown>;
  addWords(words: readonly string[] | string): void;
  splitSentence(input: string): unknown;
}

type WordsNinjaConstructor = new () => WordsNinjaInstance;
type PascalCaseFunction = (input: string) => string;

interface ChangeCaseModule {
  readonly pascalCase: PascalCaseFunction;
}

const TABLE_DISPLAY_NAME_CACHE_LIMIT = 5_000;
const runtimeRequire = createRequire(__filename);

const TABLE_NAME_ACRONYMS = new Set([
  'API',
  'CAP',
  'CDS',
  'FI',
  'GL',
  'HANA',
  'I',
  'ID',
  'M',
  'SAP',
  'S4HANA',
  'UAT',
  'UUID',
]);

const TABLE_NAME_SEGMENT_OVERRIDES = new Map([
  ['DEMO', 'Demo'],
  ['PURCHASEORDERITEMMAPPING', 'PurchaseOrderItemMapping'],
  ['BUSINESSPARTNERBANK', 'BusinessPartnerBank'],
  ['DRAFTADMINISTRATIVEDATA', 'DraftAdministrativeData'],
  ['GENERALLEDGERACCOUNTINGDOCUMENTITEM', 'GeneralLedgerAccountingDocumentItem'],
  ['SUPPLIERINVOICEPAYMENTBLOCKREASON', 'SupplierInvoicePaymentBlockReason'],
]);

const TABLE_NAME_DOMAIN_WORDS: readonly string[] = [
  'accounting',
  'administrative',
  'allocation',
  'app',
  'audit',
  'bank',
  'block',
  'business',
  'com',
  'customer',
  'data',
  'demo',
  'document',
  'draft',
  'dummy',
  'entity',
  'finance',
  'general',
  'history',
  'input',
  'invoice',
  'item',
  'items',
  'ledger',
  'long',
  'mapping',
  'namespace',
  'nested',
  'orders',
  'order',
  'purchase',
  'partner',
  'payment',
  'projection',
  'reason',
  'reconciliation',
  'service',
  'supplier',
  'table',
  'tables',
  'test',
  'very',
  'with',
  'for',
  'to',
  'sap',
  'cap',
  'cds',
  'api',
  'uat',
  'hana',
  's4hana',
  'uuid',
  'id',
];

let formatterPromise: Promise<HanaTableDisplayNameFormatter> | null = null;

export async function formatHanaTableDisplayName(tableName: string): Promise<string> {
  const formatter = await resolveFormatter();
  return formatter.format(tableName);
}

export async function formatHanaTableDisplayEntries(
  tableNames: readonly string[]
): Promise<readonly HanaTableDisplayEntry[]> {
  const formatter = await resolveFormatter();
  return tableNames.map((name) => ({
    displayName: formatter.format(name),
    name,
  }));
}

export function buildRawHanaTableDisplayEntries(
  tableNames: readonly string[]
): readonly HanaTableDisplayEntry[] {
  return tableNames.map((name) => ({ displayName: name, name }));
}

async function resolveFormatter(): Promise<HanaTableDisplayNameFormatter> {
  formatterPromise ??= createFormatter();
  return formatterPromise;
}

async function createFormatter(): Promise<HanaTableDisplayNameFormatter> {
  const WordsNinjaPack = loadWordsNinjaConstructor();
  const wordsNinja = new WordsNinjaPack();
  await wordsNinja.loadDictionary();
  wordsNinja.addWords(TABLE_NAME_DOMAIN_WORDS);

  const changeCaseModule = await loadChangeCaseModule();
  return new HanaTableDisplayNameFormatter(wordsNinja, changeCaseModule.pascalCase);
}

class HanaTableDisplayNameFormatter {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly wordsNinja: WordsNinjaInstance,
    private readonly pascalCase: PascalCaseFunction
  ) {}

  format(tableName: string): string {
    const cachedName = this.cache.get(tableName);
    if (cachedName !== undefined) {
      return cachedName;
    }

    const displayName = tableName
      .split('_')
      .map((segment) => this.formatSegment(segment))
      .join('_');
    this.remember(tableName, displayName);
    return displayName;
  }

  private formatSegment(segment: string): string {
    const normalizedSegment = segment.trim();
    if (normalizedSegment.length === 0 || /^\d+$/.test(normalizedSegment)) {
      return normalizedSegment;
    }

    const upperSegment = normalizedSegment.toUpperCase();
    if (TABLE_NAME_ACRONYMS.has(upperSegment)) {
      return upperSegment;
    }

    const overriddenSegment = TABLE_NAME_SEGMENT_OVERRIDES.get(upperSegment);
    if (overriddenSegment !== undefined) {
      return overriddenSegment;
    }

    if (/\d/.test(normalizedSegment)) {
      return normalizedSegment;
    }

    const words = this.splitWords(normalizedSegment);
    if (!this.shouldUseSplitWords(normalizedSegment, words)) {
      return this.pascalCase(normalizedSegment.toLowerCase());
    }

    return words.map((word) => this.formatWord(word)).join('');
  }

  private splitWords(segment: string): readonly string[] {
    const result = this.wordsNinja.splitSentence(segment.toLowerCase());
    if (!Array.isArray(result)) {
      return [];
    }

    return result.filter((word): word is string => {
      return typeof word === 'string' && word.length > 0;
    });
  }

  private shouldUseSplitWords(segment: string, words: readonly string[]): boolean {
    if (words.length === 0) {
      return false;
    }
    if (words.join('') !== segment.toLowerCase()) {
      return false;
    }
    return !words.every((word) => word.length === 1);
  }

  private formatWord(word: string): string {
    if (/^\d+$/.test(word)) {
      return word;
    }

    const upperWord = word.toUpperCase();
    if (TABLE_NAME_ACRONYMS.has(upperWord)) {
      return upperWord;
    }

    return this.pascalCase(word);
  }

  private remember(tableName: string, displayName: string): void {
    if (this.cache.size >= TABLE_DISPLAY_NAME_CACHE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      if (typeof firstKey === 'string') {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(tableName, displayName);
  }
}

function loadWordsNinjaConstructor(): WordsNinjaConstructor {
  const moduleValue: unknown = runtimeRequire(resolveWordsNinjaEntry());
  if (!isWordsNinjaConstructor(moduleValue)) {
    throw new Error('wordsninja did not export a constructor.');
  }
  return moduleValue;
}

async function loadChangeCaseModule(): Promise<ChangeCaseModule> {
  const moduleValue: unknown = await import(pathToFileURL(resolveChangeCaseEntry()).href);
  if (!isChangeCaseModule(moduleValue)) {
    throw new Error('change-case did not export pascalCase.');
  }
  return moduleValue;
}

function resolveWordsNinjaEntry(): string {
  const vendoredEntry = join(__dirname, 'vendor', 'wordsninja', 'index.js');
  if (existsSync(vendoredEntry)) {
    return vendoredEntry;
  }
  return runtimeRequire.resolve('wordsninja');
}

function resolveChangeCaseEntry(): string {
  const vendoredEntry = join(__dirname, 'vendor', 'change-case', 'dist', 'index.js');
  if (existsSync(vendoredEntry)) {
    return vendoredEntry;
  }
  return runtimeRequire.resolve('change-case');
}

function isWordsNinjaConstructor(value: unknown): value is WordsNinjaConstructor {
  return typeof value === 'function';
}

function isChangeCaseModule(value: unknown): value is ChangeCaseModule {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value['pascalCase'] === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
