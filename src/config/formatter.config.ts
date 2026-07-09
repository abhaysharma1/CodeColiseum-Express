import "dotenv/config";

class FormatterConfig {
    get clangFormatPath(): string {
        return process.env.CLANG_FORMAT_PATH || "clang-format";
    }

    get blackPath(): string {
        return process.env.BLACK_PATH || "black";
    }

    get googleJavaFormatJar(): string {
        const path = process.env.GOOGLE_JAVA_FORMAT_JAR;
        if (!path) {
            throw new Error(
                "GOOGLE_JAVA_FORMAT_JAR environment variable is not set",
            );
        }
        return path;
    }

    validate(): void {
        if (!process.env.GOOGLE_JAVA_FORMAT_JAR) {
            throw new Error(
                "GOOGLE_JAVA_FORMAT_JAR environment variable must be set",
            );
        }
    }
}

export const formatterConfig = new FormatterConfig();
