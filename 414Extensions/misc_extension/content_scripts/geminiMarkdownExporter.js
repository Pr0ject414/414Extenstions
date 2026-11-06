// KylesChromeExtensions/misc_extension/content_scripts/geminiMarkdownExporter.js
(function () {
    'use strict';

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const MISC_MODULE_ENABLED_KEY = 'isMiscModuleEnabled';
    const GEMINI_MARKDOWN_EXPORT_KEY = 'isGeminiMarkdownExportEnabled';

    const TOOLBAR_BTN_CLASS = 'ext414-gemini-export-md-btn';
    const MENU_ITEM_CLASS = 'ext414-gemini-export-md-menu-item';

    const IGNORED_TAGS = new Set([
        'SOURCE-FOOTNOTE',
        'SOURCES-CAROUSEL-INLINE',
        'SOURCES-CAROUSEL',
        'WEB-PREVIEW',
        'IMMERSIVE-CONTENT-ACTIONS',
        'THUMB-UP-BUTTON',
        'THUMB-DOWN-BUTTON',
        'SCRIPT',
        'STYLE',
        'IFRAME',
        'SVG',
        'MAT-ICON',
        'GEM-ICON',
        'GEM-ICON-BUTTON',
        'BUTTON',
        'TRUNCATED'
    ]);

    const IGNORED_SELECTORS = [
        '.no-md',
        '[hide-from-message-actions]',
        '.code-block-decoration',
        '.code-block-header'
    ].join(', ');

    let isFeatureActive = false;
    let observer = null;
    let activePanelForMenu = null;
    let lastExportTriggerClickTime = 0;

    function createDownloadIconElement() {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'ext414-gemini-md-icon';
        iconSpan.setAttribute('aria-hidden', 'true');

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('focusable', 'false');

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z');
        svg.appendChild(path);
        iconSpan.appendChild(svg);
        return iconSpan;
    }

    function shouldIgnoreElement(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        if (IGNORED_TAGS.has(el.tagName)) return true;
        if (typeof el.matches === 'function' && el.matches(IGNORED_SELECTORS)) return true;
        if (el.tagName === 'RESPONSE-ELEMENT') {
            if (el.classList.contains('no-md')) return true;
            if (el.querySelector('source-footnote, web-preview, immersive-content-actions')) return true;
        }
        return false;
    }

    function wrapInlineMarker(text, marker) {
        if (!text) return '';
        const leadingMatch = text.match(/^\s+/);
        const trailingMatch = text.match(/\s+$/);
        const leading = leadingMatch ? leadingMatch[0] : '';
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const core = text.trim();
        if (!core) return text;
        return `${leading}${marker}${core}${marker}${trailing}`;
    }

    function formatInlineCode(text) {
        const cleaned = String(text || '').replace(/\u00A0/g, ' ');
        if (!cleaned) return '';
        if (cleaned.includes('`')) {
            return `\`\` ${cleaned} \`\``;
        }
        return `\`${cleaned}\``;
    }

    function extractCodeBlockLanguage(el) {
        const codeEl = el.tagName === 'CODE' ? el : el.querySelector('code');
        if (codeEl && codeEl.className) {
            const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_+-]+)/);
            if (langMatch) return langMatch[1];
        }
        const headerSpan = el.querySelector('.code-block-decoration span, .code-block-header span');
        if (headerSpan && headerSpan.textContent) {
            return headerSpan.textContent.trim().toLowerCase();
        }
        return '';
    }

    function convertChildrenToMarkdown(parent, context) {
        let result = '';
        const childNodes = parent.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            result += convertNodeToMarkdown(childNodes[i], context);
        }
        return result;
    }

    function convertTableToMarkdown(tableEl) {
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        if (rows.length === 0) return '';

        const matrix = [];
        for (const tr of rows) {
            const cells = Array.from(tr.children).filter(
                (c) => c.tagName === 'TH' || c.tagName === 'TD'
            );
            if (cells.length === 0) continue;

            const rowValues = cells.map((cell) => {
                let cellMd = convertChildrenToMarkdown(cell, {
                    listDepth: 0,
                    inTableCell: true
                });
                cellMd = cellMd
                    .replace(/\r\n/g, '\n')
                    .replace(/\u00A0/g, ' ')
                    .replace(/[ \t]+\n/g, '\n')
                    .replace(/\n[ \t]+/g, '\n')
                    .replace(/\n+/g, '<br>')
                    .replace(/(?:<br>\s*){2,}/gi, '<br>')
                    .replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/gi, '')
                    .replace(/[ \t]{2,}/g, ' ')
                    .replace(/\|/g, '\\|')
                    .trim();
                return cellMd;
            });
            matrix.push(rowValues);
        }

        if (matrix.length === 0) return '';

        const colCount = Math.max(...matrix.map((r) => r.length));
        const normalizedRows = matrix.map((r) => {
            const copy = r.slice();
            while (copy.length < colCount) copy.push('');
            return copy;
        });

        const headerRow = normalizedRows[0];
        const separatorRow = new Array(colCount).fill('---');
        const bodyRows = normalizedRows.slice(1);

        const lines = [
            `| ${headerRow.join(' | ')} |`,
            `| ${separatorRow.join(' | ')} |`
        ];
        for (const row of bodyRows) {
            lines.push(`| ${row.join(' | ')} |`);
        }

        return `\n\n${lines.join('\n')}\n\n`;
    }

    function convertListToMarkdown(listEl, context) {
        const isOrdered = listEl.tagName === 'OL';
        const startAttr = parseInt(listEl.getAttribute('start') || '1', 10);
        let counter = Number.isNaN(startAttr) ? 1 : startAttr;
        const depth = context.listDepth || 0;
        const indent = '  '.repeat(depth);

        const items = Array.from(listEl.children).filter((c) => c.tagName === 'LI');
        if (items.length === 0) return '';

        const itemLines = [];
        for (const li of items) {
            const prefix = isOrdered ? `${counter}. ` : '- ';
            counter++;

            const rawItem = convertChildrenToMarkdown(li, {
                ...context,
                listDepth: depth + 1,
                inListItem: true
            })
                .replace(/\u00A0/g, ' ')
                .trim();

            if (!rawItem) continue;

            const lines = rawItem.split('\n');
            const formattedLines = lines.map((line, idx) => {
                if (idx === 0) return `${indent}${prefix}${line.trim()}`;
                if (!line.trim()) return '';
                return `${indent}   ${line}`;
            });
            itemLines.push(formattedLines.join('\n'));
        }

        if (depth === 0) {
            return `\n\n${itemLines.join('\n\n')}\n\n`;
        }
        return `\n${itemLines.join('\n')}`;
    }

    function convertNodeToMarkdown(node, context = { listDepth: 0, inTableCell: false, inListItem: false }) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.nodeValue || '';
            text = text.replace(/\u00A0/g, ' ');
            if (!context.inPre) {
                text = text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
            }
            return text;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const el = node;
        if (shouldIgnoreElement(el)) {
            return '';
        }

        const tag = el.tagName;

        if (/^H[1-6]$/.test(tag)) {
            const level = parseInt(tag.slice(1), 10);
            const headingText = convertChildrenToMarkdown(el, context).replace(/\s+/g, ' ').trim();
            if (!headingText) return '';
            if (context.inTableCell) {
                return `**${headingText}**\n`;
            }
            return `\n\n${'#'.repeat(level)} ${headingText}\n\n`;
        }

        if (tag === 'P') {
            const content = convertChildrenToMarkdown(el, context).trim();
            if (!content) return '';
            if (context.inTableCell) {
                return `${content}\n`;
            }
            if (context.inListItem) {
                return `${content}\n`;
            }
            return `\n\n${content}\n\n`;
        }

        if (tag === 'BR') {
            return '\n';
        }

        if (tag === 'HR') {
            return context.inTableCell ? '<br>' : '\n\n---\n\n';
        }

        if (tag === 'B' || tag === 'STRONG') {
            const inner = convertChildrenToMarkdown(el, context);
            return wrapInlineMarker(inner, '**');
        }

        if (tag === 'I' || tag === 'EM') {
            const inner = convertChildrenToMarkdown(el, context);
            return wrapInlineMarker(inner, '*');
        }

        if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
            const inner = convertChildrenToMarkdown(el, context);
            return wrapInlineMarker(inner, '~~');
        }

        if (tag === 'CODE') {
            if (context.inPre) {
                return el.textContent || '';
            }
            return formatInlineCode(el.textContent || '');
        }

        if (tag === 'PRE' || tag === 'CODE-BLOCK') {
            const lang = extractCodeBlockLanguage(el);
            const codeEl = el.querySelector('pre code, code, pre') || el;
            const codeText = (codeEl.textContent || '').replace(/\u00A0/g, ' ').replace(/\n+$/, '');
            if (context.inTableCell) {
                return formatInlineCode(codeText.replace(/\r?\n/g, ' '));
            }
            return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
        }

        if (tag === 'A') {
            const text = convertChildrenToMarkdown(el, context).trim();
            const href = el.getAttribute('href') || '';
            if (!href || href.startsWith('javascript:')) {
                return text;
            }
            return text ? `[${text}](${href})` : href;
        }

        if (tag === 'IMG') {
            const alt = (el.getAttribute('alt') || 'Image').trim();
            const src = el.getAttribute('src') || '';
            if (!src) return '';
            return `![${alt}](${src})`;
        }

        if (tag === 'BLOCKQUOTE') {
            const inner = convertChildrenToMarkdown(el, context).trim();
            if (!inner) return '';
            const quoted = inner
                .split('\n')
                .map((line) => (line.trim() ? `> ${line}` : '>'))
                .join('\n');
            return `\n\n${quoted}\n\n`;
        }

        if (tag === 'UL' || tag === 'OL') {
            return convertListToMarkdown(el, context);
        }

        if (tag === 'TABLE') {
            return convertTableToMarkdown(el);
        }

        return convertChildrenToMarkdown(el, context);
    }

    function normalizeMarkdown(rawMarkdown) {
        return String(rawMarkdown || '')
            .replace(/\r\n/g, '\n')
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim() + '\n';
    }

    function findReportPanel(startNode) {
        if (startNode && typeof startNode.closest === 'function') {
            const panel = startNode.closest('deep-research-immersive-panel, immersive-editor, [data-test-id="immersive-panel"]');
            if (panel) return panel;
        }
        return (
            document.querySelector('deep-research-immersive-panel') ||
            document.querySelector('immersive-editor') ||
            document
        );
    }

    function getReportTitle(panel = document) {
        const root = panel || document;
        const toolbarTitleEl = root.querySelector('toolbar .title-text, h2.title-text');
        if (toolbarTitleEl && toolbarTitleEl.textContent && toolbarTitleEl.textContent.trim()) {
            return toolbarTitleEl.textContent.trim();
        }
        const h1El = root.querySelector('#extended-response-markdown-content h1, message-content .markdown h1, .markdown-main-panel h1');
        if (h1El && h1El.textContent && h1El.textContent.trim()) {
            return h1El.textContent.trim();
        }
        return 'gemini-report';
    }

    function sanitizeFilename(title) {
        const cleaned = String(title || 'gemini-report')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const base = cleaned || 'gemini-report';
        return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
    }

    function extractReportMarkdown(panel = document) {
        const root = panel || document;
        const markdownContainer =
            root.querySelector('#extended-response-markdown-content') ||
            root.querySelector('structured-content-container message-content .markdown') ||
            root.querySelector('message-content .markdown') ||
            root.querySelector('.markdown-main-panel');

        if (!markdownContainer) return '';

        let markdown = convertNodeToMarkdown(markdownContainer, {
            listDepth: 0,
            inTableCell: false,
            inListItem: false
        });

        markdown = normalizeMarkdown(markdown);

        // If the report body does not already begin with a top-level H1 heading, prepend the toolbar title
        const hasLeadingH1 = /^#\s+\S/.test(markdown);
        if (!hasLeadingH1) {
            const toolbarTitle = getReportTitle(root);
            if (toolbarTitle && toolbarTitle !== 'gemini-report') {
                markdown = `# ${toolbarTitle}\n\n${markdown}`;
            }
        }

        return markdown;
    }

    function triggerMarkdownDownload(markdownContent, filename) {
        if (!markdownContent) return false;

        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        anchor.setAttribute('data-test-id', 'ext414-markdown-download-anchor');

        const targetParent = document.body || document.documentElement;
        targetParent.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
        }, 1000);

        return true;
    }

    function handleExportClick(panel, buttonEl) {
        const targetPanel = findReportPanel(panel || activePanelForMenu);
        const markdown = extractReportMarkdown(targetPanel);
        if (!markdown.trim()) return false;

        const title = getReportTitle(targetPanel);
        const filename = sanitizeFilename(title);
        const downloaded = triggerMarkdownDownload(markdown, filename);

        if (downloaded && buttonEl && buttonEl.classList.contains(TOOLBAR_BTN_CLASS)) {
            buttonEl.classList.add('ext414-md-downloaded');
            const labelSpan = buttonEl.querySelector('.ext414-gemini-md-label');
            const prevText = labelSpan ? labelSpan.textContent : 'Download .md';
            if (labelSpan) labelSpan.textContent = 'Downloaded!';
            setTimeout(() => {
                buttonEl.classList.remove('ext414-md-downloaded');
                if (labelSpan) labelSpan.textContent = prevText;
            }, 1600);
        }

        return downloaded;
    }

    function createToolbarDownloadButton(panel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-test-id', 'export-markdown-button');
        btn.setAttribute('aria-label', 'Download report as Markdown (.md)');
        btn.setAttribute('title', 'Download report as Markdown (.md)');
        btn.className = `mdc-button mat-mdc-button-base mdc-button--unelevated mat-mdc-unelevated-button ${TOOLBAR_BTN_CLASS}`;

        const icon = createDownloadIconElement();
        const labelWrapper = document.createElement('span');
        labelWrapper.className = 'mdc-button__label';
        const labelText = document.createElement('span');
        labelText.className = 'ext414-gemini-md-label';
        labelText.textContent = 'Download .md';
        labelWrapper.appendChild(labelText);

        btn.append(icon, labelWrapper);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleExportClick(panel, btn);
        });

        return btn;
    }

    function createMenuDownloadButton(panel) {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('mat-menu-item', '');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-test-id', 'export-markdown-menu-button');
        item.className = `mat-mdc-menu-item mat-focus-indicator ${MENU_ITEM_CLASS}`;

        const icon = createDownloadIconElement();
        const textSpan = document.createElement('span');
        textSpan.className = 'mat-mdc-menu-item-text';
        const innerSpan = document.createElement('span');
        innerSpan.textContent = 'Download as Markdown (.md)';
        textSpan.appendChild(innerSpan);

        item.append(icon, textSpan);
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            handleExportClick(panel, item);

            // Close open Angular Material overlay menu if present
            const backdrop = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
            if (backdrop && typeof backdrop.click === 'function') {
                backdrop.click();
            }
        });

        return item;
    }

    function findOpenExportMenuContainers() {
        const containers = new Set();

        // 1. Check aria-controls / aria-owns on export-menu-button
        const exportBtns = document.querySelectorAll('button[data-test-id="export-menu-button"]');
        exportBtns.forEach((btn) => {
            const controlledId = btn.getAttribute('aria-controls') || btn.getAttribute('aria-owns');
            if (controlledId) {
                const panelEl = document.getElementById(controlledId);
                if (panelEl) {
                    const contentEl = panelEl.querySelector('.mat-mdc-menu-content') || panelEl;
                    containers.add(contentEl);
                }
            }
        });

        // 2. Check open overlay menus when export-menu-button is expanded or recently clicked
        const anyExpanded = Array.from(exportBtns).some(
            (btn) => btn.getAttribute('aria-expanded') === 'true'
        );
        const recentlyClicked = Date.now() - lastExportTriggerClickTime < 1500;

        if (anyExpanded || recentlyClicked) {
            const overlayMenus = document.querySelectorAll(
                '.cdk-overlay-container .mat-mdc-menu-panel .mat-mdc-menu-content, .cdk-overlay-container .mat-mdc-menu-content'
            );
            overlayMenus.forEach((menuContent) => {
                containers.add(menuContent);
            });
        }

        // 3. Also check if any overlay menu contains typical Share & Export options (e.g. Export to Docs / Copy)
        const allMenuContents = document.querySelectorAll('.mat-mdc-menu-content');
        allMenuContents.forEach((menuContent) => {
            const text = (menuContent.textContent || '').toLowerCase();
            if (
                text.includes('export to docs') ||
                text.includes('copy contents') ||
                text.includes('google docs') ||
                text.includes('share')
            ) {
                containers.add(menuContent);
            }
        });

        return containers;
    }

    function injectIntoExportMenus() {
        if (!isFeatureActive) return;
        const menuContainers = findOpenExportMenuContainers();
        menuContainers.forEach((menuContent) => {
            if (!menuContent.querySelector(`.${MENU_ITEM_CLASS}`)) {
                const menuItem = createMenuDownloadButton(activePanelForMenu);
                menuContent.appendChild(menuItem);
            }
        });
    }

    function enhanceReportToolbars(root = document) {
        if (!isFeatureActive) return;
        if (!root || typeof root.querySelectorAll !== 'function') return;

        const exportButtons = [];
        if (root instanceof Element && root.matches('button[data-test-id="export-menu-button"]')) {
            exportButtons.push(root);
        }
        root.querySelectorAll('button[data-test-id="export-menu-button"]').forEach((btn) => {
            exportButtons.push(btn);
        });

        exportButtons.forEach((exportBtn) => {
            const panel = findReportPanel(exportBtn);

            if (!exportBtn.dataset.ext414ExportHooked) {
                exportBtn.dataset.ext414ExportHooked = 'true';
                exportBtn.addEventListener('click', () => {
                    activePanelForMenu = panel;
                    lastExportTriggerClickTime = Date.now();
                    setTimeout(injectIntoExportMenus, 0);
                    setTimeout(injectIntoExportMenus, 60);
                });
            }

            const actionContainer = exportBtn.parentElement;
            if (!actionContainer) return;

            if (!actionContainer.querySelector(`.${TOOLBAR_BTN_CLASS}`)) {
                const downloadBtn = createToolbarDownloadButton(panel);
                const siblingMenu =
                    exportBtn.nextElementSibling && exportBtn.nextElementSibling.tagName === 'MAT-MENU'
                        ? exportBtn.nextElementSibling
                        : exportBtn;
                siblingMenu.insertAdjacentElement('afterend', downloadBtn);
            }
        });

        injectIntoExportMenus();
    }

    function removeInjectedElements() {
        document
            .querySelectorAll(`.${TOOLBAR_BTN_CLASS}, .${MENU_ITEM_CLASS}`)
            .forEach((el) => el.remove());
    }

    function startObserver() {
        enhanceReportToolbars(document);
        if (observer || typeof MutationObserver === 'undefined') return;

        const target = document.body || document.documentElement;
        if (!target) return;

        observer = new MutationObserver((mutations) => {
            if (!isFeatureActive) return;
            let shouldCheckMenus = false;
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        enhanceReportToolbars(node);
                        shouldCheckMenus = true;
                    }
                });
            }
            if (shouldCheckMenus) {
                injectIntoExportMenus();
            }
        });

        observer.observe(target, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        removeInjectedElements();
    }

    function updateSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY,
            MISC_MODULE_ENABLED_KEY,
            GEMINI_MARKDOWN_EXPORT_KEY
        ], (result) => {
            const globalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const moduleOn = result[MISC_MODULE_ENABLED_KEY] !== false;
            // Default to ON (true) unless explicitly disabled
            const geminiExportOn = result[GEMINI_MARKDOWN_EXPORT_KEY] !== false;

            isFeatureActive = globalOn && moduleOn && geminiExportOn;

            if (isFeatureActive) {
                startObserver();
            } else {
                stopObserver();
            }
        });
    }

    // Expose helpers for testing
    window.__EXT414_GEMINI_MD_EXPORTER__ = {
        extractReportMarkdown,
        getReportTitle,
        sanitizeFilename,
        handleExportClick
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateSettings);
    } else {
        updateSettings();
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (
                changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] ||
                changes[MISC_MODULE_ENABLED_KEY] ||
                changes[GEMINI_MARKDOWN_EXPORT_KEY]
            ) {
                updateSettings();
            }
        }
    });
})();
