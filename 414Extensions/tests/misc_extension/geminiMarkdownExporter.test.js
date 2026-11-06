import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('geminiMarkdownExporter.js', () => {
    let mockStorageData;
    let mockOnChangedListeners;
    let createdBlobUrls;
    let lastCreatedBlob;

    const GEMINI_DEEP_RESEARCH_REPORT_HTML = `
        <deep-research-immersive-panel _ngcontent-ng-c3265710640="" _nghost-ng-c3278107743="" class="ng-tns-c3278107743-16 ng-star-inserted">
            <toolbar _ngcontent-ng-c3278107743="" class="ng-tns-c3278107743-16 enable-file-gen-two">
                <div class="toolbar has-title">
                    <div class="left-panel">
                        <mat-icon role="img" data-test-id="immersive-icon" fonticon="travel_explore"></mat-icon>
                        <h2 class="title-text gds-title-s ng-star-inserted">Local AI 3D Game Workflow</h2>
                    </div>
                    <div class="action-buttons">
                        <toc-menu class="ng-star-inserted">
                            <button mat-button="" aria-label="Table of contents menu" data-test-id="toc-menu-button">
                                <span class="mdc-button__label"><span>Contents</span></span>
                            </button>
                            <mat-menu yposition="below" xposition="before"></mat-menu>
                        </toc-menu>
                        <button mat-flat-button="" data-test-id="export-menu-button" class="mdc-button mat-mdc-button-base mat-mdc-menu-trigger export-menu-button mdc-button--unelevated mat-mdc-unelevated-button" aria-haspopup="menu" aria-expanded="false">
                            <span class="mdc-button__label"><span>Share &amp; Export</span></span>
                            <mat-icon role="img" iconpositionend="" fonticon="keyboard_arrow_down"></mat-icon>
                        </button>
                        <mat-menu xposition="before" yposition="below"></mat-menu>
                        <canvas-create-button data-test-id="create-button" class="create-button-container">
                            <button data-test-id="canvas-create-task-menu">Create</button>
                        </canvas-create-button>
                    </div>
                </div>
            </toolbar>
            <div cdkscrollable="" data-test-id="scroll-container" class="container">
                <response-container class="response-container">
                    <div class="presented-response-container">
                        <div class="response-container-content">
                            <structured-content-container data-test-id="message-content">
                                <div class="container">
                                    <message-content id="extended-response-message-content">
                                        <div inline-copy-host="" class="markdown markdown-main-panel md-content" id="extended-response-markdown-content">
                                            <h1 dir="ltr" data-path-to-node="0">Local 3D AI Asset Production and Agentic Orchestration Blueprint for Knights of Draconia</h1>
                                            <p dir="ltr" data-path-to-node="1">
                                                <span data-path-to-node="1,0">Building a full-scale MMORPG remake of <i>Knight Online</i>—titled <b><i>Knights of Draconia</i></b>—on a local Windows workstation powered by an <b>AMD Radeon RX 7900 XTX (24 GB VRAM)</b> requires a strict architectural division of labor between agentic code execution and neural 3D synthesis</span><span data-path-to-node="1,1"><span><response-element class="no-md"><source-footnote><sup class="superscript" data-turn-source-index="1"></sup></source-footnote></response-element></span></span><span data-path-to-node="1,2">. While <b>Gemini 4 Argon</b> inside <b>Google Antigravity</b> excels at multi-step reasoning, Python (<code>bpy</code> and <code>bmesh</code>) scripting, and scene assembly through <b>Blender MCP</b></span><span data-path-to-node="1,3"><span><response-element class="no-md"><source-footnote><sup class="superscript" data-turn-source-index="3"></sup></source-footnote></response-element></span></span><span data-path-to-node="1,6">.</span>
                                                <sources-carousel-inline>
                                                    <span hide-from-message-actions="" class="button-container hide-from-message-actions"> &nbsp; <button hide-from-message-actions="" aria-label="Learn More"><mat-icon fonticon="expand_more"></mat-icon></button></span>
                                                    <sources-carousel hide-from-message-actions="" id="sources"></sources-carousel>
                                                </sources-carousel-inline>
                                            </p>
                                            <h2 dir="ltr" data-path-to-node="5">1. Local Hardware &amp; ComfyUI Desktop Optimization for AMD RX 7900 XTX</h2>
                                            <ol start="1" dir="ltr" data-path-to-node="12">
                                                <li>
                                                    <p dir="ltr"><span><b>Verify ROCm GPU Detection in the <code>.venv</code></b>: Open Command Prompt and activate <code>.venv\\Scripts\\activate</code></span><span><response-element class="no-md"><source-footnote><sup class="superscript" data-turn-source-index="10"></sup></source-footnote></response-element></span><span>.</span></p>
                                                </li>
                                                <li>
                                                    <p dir="ltr"><span><b>Enable Tiled VAE Decoding</b>: Always use <b>Tiled VAE Decode</b> nodes</span><span>.</span></p>
                                                </li>
                                            </ol>
                                            <div class="attachment-container model-assisted-ui md-has-block-component">
                                                <response-element class="no-md">
                                                    <web-preview>
                                                        <div class="container"><div><iframe title="Preview" src="https://example.com/shim.html"></iframe></div></div>
                                                        <div class="footer-row">
                                                            <immersive-content-actions>
                                                                <thumb-up-button><button aria-label="Good response"></button></thumb-up-button>
                                                                <thumb-down-button><button aria-label="Bad response"></button></thumb-down-button>
                                                            </immersive-content-actions>
                                                        </div>
                                                    </web-preview>
                                                </response-element>
                                            </div>
                                            <div class="horizontal-scroll-wrapper">
                                                <table data-path-to-node="22">
                                                    <thead>
                                                        <tr>
                                                            <th><span>Exact Filename</span></th>
                                                            <th><span>Component Role</span></th>
                                                            <th><span>File Size</span></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td><span><code>pixal3d_int8_convrot.safetensors</code></span></td>
                                                            <td><p><span><b>2D Concept</b>: SDXL/Flux</span><br><span><b>3D Mesh</b>: <b>Pixal3D</b></span></p></td>
                                                            <td><p><span>5.58 GB</span><span><response-element class="no-md"><source-footnote><sup class="superscript"></sup></source-footnote></response-element></span></p></td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </message-content>
                                </div>
                            </structured-content-container>
                        </div>
                    </div>
                </response-container>
            </div>
        </deep-research-immersive-panel>
    `;

    beforeEach(() => {
        document.documentElement.className = '';
        document.body.innerHTML = GEMINI_DEEP_RESEARCH_REPORT_HTML;
        mockOnChangedListeners = [];
        createdBlobUrls = [];
        lastCreatedBlob = null;

        mockStorageData = {
            isGlobalMasterSwitchEnabled: true,
            isMiscModuleEnabled: true
            // isGeminiMarkdownExportEnabled omitted to test default ON (true)
        };

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((keys, callback) => {
                        const res = {};
                        keys.forEach((k) => {
                            res[k] = mockStorageData[k];
                        });
                        callback(res);
                    })
                },
                onChanged: {
                    addListener: jest.fn((fn) => {
                        mockOnChangedListeners.push(fn);
                    })
                }
            }
        };

        global.URL.createObjectURL = jest.fn((blob) => {
            lastCreatedBlob = blob;
            const url = `blob:https://gemini.google.com/mock-${createdBlobUrls.length + 1}`;
            createdBlobUrls.push(url);
            return url;
        });
        global.URL.revokeObjectURL = jest.fn();
    });

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../misc_extension/content_scripts/geminiMarkdownExporter.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    it('should default to ON and inject the Download .md button in the report toolbar', () => {
        loadScript();

        const toolbarBtn = document.querySelector('button[data-test-id="export-markdown-button"]');
        expect(toolbarBtn).not.toBeNull();
        expect(toolbarBtn.textContent).toContain('Download .md');
    });

    it('should inject "Download as Markdown (.md)" into the Share & Export dropdown menu when opened', async () => {
        loadScript();

        const exportMenuBtn = document.querySelector('button[data-test-id="export-menu-button"]');
        expect(exportMenuBtn).not.toBeNull();

        // Simulate Angular Material opening the Share & Export menu overlay
        exportMenuBtn.setAttribute('aria-expanded', 'true');
        exportMenuBtn.setAttribute('aria-controls', 'mat-menu-panel-0');
        exportMenuBtn.click();

        const overlayContainer = document.createElement('div');
        overlayContainer.className = 'cdk-overlay-container';
        overlayContainer.innerHTML = `
            <div class="cdk-overlay-backdrop cdk-overlay-backdrop-showing"></div>
            <div class="cdk-overlay-pane">
                <div class="mat-mdc-menu-panel" id="mat-menu-panel-0">
                    <div class="mat-mdc-menu-content">
                        <button mat-menu-item="" class="mat-mdc-menu-item">Export to Docs</button>
                        <button mat-menu-item="" class="mat-mdc-menu-item">Copy contents</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlayContainer);

        await Promise.resolve();

        const menuDownloadItem = overlayContainer.querySelector('button[data-test-id="export-markdown-menu-button"]');
        expect(menuDownloadItem).not.toBeNull();
        expect(menuDownloadItem.textContent).toContain('Download as Markdown (.md)');
    });

    it('should convert report HTML to clean GFM Markdown stripping footnotes, carousels, and web-preview widgets', () => {
        loadScript();

        const exporter = window.__EXT414_GEMINI_MD_EXPORTER__;
        expect(exporter).toBeDefined();

        const panel = document.querySelector('deep-research-immersive-panel');
        const title = exporter.getReportTitle(panel);
        expect(title).toBe('Local AI 3D Game Workflow');
        expect(exporter.sanitizeFilename(title)).toBe('Local AI 3D Game Workflow.md');

        const markdown = exporter.extractReportMarkdown(panel);

        // Verify H1 and H2 headings
        expect(markdown).toContain('# Local 3D AI Asset Production and Agentic Orchestration Blueprint for Knights of Draconia');
        expect(markdown).toContain('## 1. Local Hardware & ComfyUI Desktop Optimization for AMD RX 7900 XTX');

        // Verify bold, italic, and inline code without footnote gaps
        expect(markdown).toContain('Building a full-scale MMORPG remake of *Knight Online*—titled ***Knights of Draconia***—on a local Windows workstation powered by an **AMD Radeon RX 7900 XTX (24 GB VRAM)** requires a strict architectural division of labor between agentic code execution and neural 3D synthesis. While **Gemini 4 Argon** inside **Google Antigravity** excels at multi-step reasoning, Python (`bpy` and `bmesh`) scripting, and scene assembly through **Blender MCP**.');

        // Verify ordered list
        expect(markdown).toContain('1. **Verify ROCm GPU Detection in the `.venv`**: Open Command Prompt and activate `.venv\\Scripts\\activate`.');
        expect(markdown).toContain('2. **Enable Tiled VAE Decoding**: Always use **Tiled VAE Decode** nodes.');

        // Verify table conversion with multi-line cell joined by <br>
        expect(markdown).toContain('| Exact Filename | Component Role | File Size |');
        expect(markdown).toContain('| --- | --- | --- |');
        expect(markdown).toContain('| `pixal3d_int8_convrot.safetensors` | **2D Concept**: SDXL/Flux<br>**3D Mesh**: **Pixal3D** | 5.58 GB |');

        // Verify UI chrome (Learn More, Good/Bad response, iframe) is completely stripped
        expect(markdown).not.toContain('Learn More');
        expect(markdown).not.toContain('expand_more');
        expect(markdown).not.toContain('Good response');
        expect(markdown).not.toContain('shim.html');
    });

    it('should trigger a .md file download when clicking the Download .md button', () => {
        loadScript();

        let clickedDownloadFilename = null;
        let clickedDownloadHref = null;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            clickedDownloadFilename = this.download;
            clickedDownloadHref = this.href;
        };

        try {
            const toolbarBtn = document.querySelector('button[data-test-id="export-markdown-button"]');
            toolbarBtn.click();

            expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
            expect(lastCreatedBlob).toBeInstanceOf(Blob);
            expect(clickedDownloadFilename).toBe('Local AI 3D Game Workflow.md');
            expect(clickedDownloadHref).toBe('blob:https://gemini.google.com/mock-1');
            expect(toolbarBtn.classList.contains('ext414-md-downloaded')).toBe(true);
        } finally {
            HTMLAnchorElement.prototype.click = origClick;
        }
    });

    it('should remove injected buttons when disabled via storage toggle or Misc module switch', () => {
        loadScript();

        expect(document.querySelector('button[data-test-id="export-markdown-button"]')).not.toBeNull();

        // Disable via Gemini Markdown Export toggle
        mockStorageData.isGeminiMarkdownExportEnabled = false;
        mockOnChangedListeners.forEach((fn) =>
            fn({ isGeminiMarkdownExportEnabled: { newValue: false } }, 'local')
        );

        expect(document.querySelector('button[data-test-id="export-markdown-button"]')).toBeNull();

        // Re-enable
        mockStorageData.isGeminiMarkdownExportEnabled = true;
        mockOnChangedListeners.forEach((fn) =>
            fn({ isGeminiMarkdownExportEnabled: { newValue: true } }, 'local')
        );

        expect(document.querySelector('button[data-test-id="export-markdown-button"]')).not.toBeNull();
    });
});
