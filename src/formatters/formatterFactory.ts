import { CodeFormatter, SupportedLanguage } from "./codeFormatter.types";
import { CFormatter } from "./cFormatter";
import { CppFormatter } from "./cppFormatter";
import { JavaFormatter } from "./javaFormatter";
import { PythonFormatter } from "./pythonFormatter";

const formatters: Record<SupportedLanguage, CodeFormatter> = {
    c: new CFormatter(),
    cpp: new CppFormatter(),
    java: new JavaFormatter(),
    python: new PythonFormatter(),
};

export function getFormatter(language: string): CodeFormatter {
    const formatter = formatters[language as SupportedLanguage];
    if (!formatter) {
        const err = new Error(`Unsupported language: ${language}`);
        (err as any).status = 400;
        throw err;
    }
    return formatter;
}
