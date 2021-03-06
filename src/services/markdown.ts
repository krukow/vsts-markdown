import * as $ from "jquery";

import * as toMarkdown from "to-markdown";
import * as MarkdownIt from "markdown-it";
import * as hljs from "highlight.js";

import { FormatAction } from "../model/model";
import { ImageSizeCache } from "../services/imageSizeCache";

export const sharedStyles = require("raw!../assets/vsts-style.style");

const __md = "__md";
const __mdStyle = "__mdStyle";
const __mdBlock = "__mdBlock";

var md = new MarkdownIt({
    linkify: true,

    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(lang, str).value;
            } catch (__) {
                // Ignore 
            }
        }

        return ''; // use external default escaping
    }
});


// Customize image rendering
var defaultRender = md.renderer.rules.image;

md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const aIndex = token.attrIndex('src');
    const src = token.attrs[aIndex][1];

    const height = ImageSizeCache.getInstance().get(src);
    if (height) {
        return `<img src="${src}" height="${height}" />`;
    }

    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self);
};

export namespace Markdown {
    function unescape(html: string): string {
        return html
            .replace(/&quot;/g, `"`)
            .replace(/&#39;/g, `'`);
    }

    export function renderMarkdown(input: string): string {
        return unescape(md.render(input));
    }

    export function convertToMarkdown(value: string): string {
        // Work around strange spacing issues
        value = value.replace("&nbsp;", " ");

        return toMarkdown(value, {
            converters: [
                {
                    filter: "&nbsp;",
                    replacement: (innerHtml) => " "
                },
                {
                    filter: ["span"],
                    replacement: (innerHtml, node: HTMLSpanElement) => {
                        if (node.style && node.style.fontStyle) {
                            if (node.style.fontStyle === "italic") {
                                return `_${innerHtml}_`;
                            } else if (node.style.fontStyle === "italic") {
                                return `*${innerHtml}*`;
                            }
                        }

                        return innerHtml;
                    }
                },
                {
                    filter: ["div"],
                    replacement: (innerHtml) => `\n${innerHtml}`
                }
            ]
        });
    }

    export function extractMarkdown(value: string): { markdownContent: string; htmlContent: string; } {
        let parsed = $("<div></div>").html(value);
        parsed.find(`#${__mdStyle}`).remove();
        parsed.find(`#${__mdBlock}`).remove();
        let inputHtml = parsed.find(`.rendered-markdown`).html();
        let mdElement = parsed.find(`#${__md}`);

        if (mdElement.length === 0) {
            // No hidden md content found
            return {
                markdownContent: null,
                htmlContent: value
            };
        } else {
            // Hiden md content found
            const md = mdElement.text();
            mdElement.remove();

            // Store any image reference
            parsed.find("img").each((idx, elem: HTMLImageElement) => {
                const height = Number($(elem).attr("height"));
                if (height) {
                    ImageSizeCache.getInstance().store(elem.src, height);
                }
            });

            return {
                markdownContent: md,
                htmlContent: unescape(inputHtml)
            };
        }
    }

    export function buildOutput(markdownContent: string): string {
        let htmlContent = renderMarkdown(markdownContent);

        htmlContent = htmlContent.replace(/id="(.+)"/g, "id=$1");

        return `<div style="display:none;width:0;height:0;overflow:hidden;position:absolute;font-size:0;" id=${__md}>${markdownContent}</div><style id=${__mdStyle}>
${sharedStyles}
</style><div class=rendered-markdown>${htmlContent}</div>`;
    }

    export function compare(markdownContent: string, inputHtmlContent: string): boolean {
        const generatedMarkdownContenxt = Markdown.renderMarkdown(markdownContent);
        const trimmedHtmlContent = inputHtmlContent.trim();

        return (trimmedHtmlContent !== "" && trimmedHtmlContent !== generatedMarkdownContenxt.trim());
    }

    export function applyFormatting(selectionStart: number, selectionEnd: number, formatAction: FormatAction, markdownContent: string): string {
        let contentToBeFormatted = markdownContent.substr(selectionStart, selectionEnd - selectionStart);
        return markdownContent.substr(0, selectionStart) + format(formatAction, contentToBeFormatted) + markdownContent.substr(selectionEnd);
    }

    export function format(formatAction: FormatAction, content: string): string {
        switch (formatAction) {
            case FormatAction.Bold:
                return toggleToken("**", content);

            case FormatAction.Italic:
                return toggleToken("_", content);
        }
    }

    export function toggleToken(token: string, content: string): string {
        const tokenLength = token.length;
        if (content.substr(0, tokenLength) === token && content.substr(content.length - tokenLength) === token) {
            return content.substr(tokenLength, content.length - (tokenLength * 2));
        } else {
            return `${token}${content}${token}`;
        }
    }

    export function imageToken(fileName: string, url: string): string {
        return `![${fileName}](${url})`;
    }
}