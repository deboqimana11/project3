const state = {
    book: null,
    currentChapterIndex: 0,
    themeIndex: 0,
    fontScale: 0,
    lineHeightScale: 0,
    widthScale: 0,
    progressByChapter: {}
};

const THEME_ORDER = ["theme-light", "theme-sepia", "theme-dark"];
const FONT_SCALE_STEP = 0.08;
const FONT_SCALE_MIN = -0.4;
const FONT_SCALE_MAX = 0.7;
const LINE_HEIGHT_STEP = 0.08;
const LINE_HEIGHT_MIN = -0.16;
const LINE_HEIGHT_MAX = 0.32;
const WIDTH_STEP = 40;
const WIDTH_MIN = -80;
const WIDTH_MAX = 160;
const READER_BASE_FONT = 1.1;
const READER_BASE_LINE_HEIGHT = 1.85;
const READER_BASE_WIDTH = 680;
const STORAGE_KEY = "cloud-ink-reader-settings";

const body = document.body;
const sidebar = document.querySelector(".sidebar");
const tocList = document.getElementById("toc-list");
const tocTemplate = document.getElementById("chapter-item-template");
const readerContent = document.getElementById("reader-content");
const readingArea = document.querySelector(".reading-area");
const chapterLabel = document.getElementById("chapter-label");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const prevButton = document.getElementById("prev-chapter");
const nextButton = document.getElementById("next-chapter");
const menuToggle = document.getElementById("menu-toggle");
const fontDecrease = document.getElementById("font-decrease");
const fontIncrease = document.getElementById("font-increase");
const themeToggle = document.getElementById("theme-toggle");
const settingsToggle = document.getElementById("settings-toggle");
const settingsClose = document.getElementById("settings-close");
const settingsPanel = document.getElementById("settings-panel");
const fontSizeSlider = document.getElementById("font-size-slider");
const lineHeightSlider = document.getElementById("line-height-slider");
const widthSlider = document.getElementById("width-slider");
const fontSizeValue = document.getElementById("font-size-value");
const lineHeightValue = document.getElementById("line-height-value");
const widthValue = document.getElementById("width-value");
const resetSettingsButton = document.getElementById("reset-settings");
const themeOptions = Array.from(document.querySelectorAll(".theme-option"));
const bookTitleEl = document.querySelector(".book-title");
const bookAuthorEl = document.querySelector(".book-author");

let tocItems = [];
let scrollRaf = null;
let isSettingsOpen = false;

init();

async function init() {
    loadSettings();
    applyTheme(state.themeIndex);
    applyFontScale(state.fontScale);
    applyLineHeight(state.lineHeightScale);
    applyWidth(state.widthScale);
    syncThemeOptions();
    syncRangeControls();
    attachEventListeners();
    await loadBook();
}

function attachEventListeners() {
    menuToggle.addEventListener("click", () => {
        body.classList.toggle("sidebar-open");
        if (body.classList.contains("sidebar-open")) {
            sidebar.focus?.();
        }
    });

    readingArea.addEventListener("scroll", () => {
        if (!scrollRaf) {
            scrollRaf = window.requestAnimationFrame(() => {
                scrollRaf = null;
                updateProgress();
            });
        }
    });

    fontDecrease.addEventListener("click", () => adjustFont(-FONT_SCALE_STEP));
    fontIncrease.addEventListener("click", () => adjustFont(FONT_SCALE_STEP));
    themeToggle.addEventListener("click", rotateTheme);
    settingsToggle.addEventListener("click", toggleSettingsPanel);
    settingsClose.addEventListener("click", closeSettingsPanel);
    resetSettingsButton.addEventListener("click", resetSettings);

    fontSizeSlider.addEventListener("input", () => setFontScale(sliderToScale(fontSizeSlider.value)));
    lineHeightSlider.addEventListener("input", () => setLineHeight(sliderToLineHeight(lineHeightSlider.value)));
    widthSlider.addEventListener("input", () => setWidth(sliderToWidth(widthSlider.value)));

    themeOptions.forEach(option => {
        option.addEventListener("click", () => {
            const index = THEME_ORDER.indexOf(option.dataset.theme);
            if (index !== -1) {
                applyTheme(index);
                state.themeIndex = index;
                syncThemeOptions();
                persistSettings();
            }
        });
    });

    prevButton.addEventListener("click", () => jumpChapter(state.currentChapterIndex - 1));
    nextButton.addEventListener("click", () => jumpChapter(state.currentChapterIndex + 1));

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (evt) => {
        if (state.themeIndex === 0) {
            const targetIndex = evt.matches ? 2 : 0;
            applyTheme(targetIndex);
            state.themeIndex = targetIndex;
            persistSettings();
        }
    });

    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", (event) => {
        if (!isSettingsOpen) {
            return;
        }
        const target = event.target;
        if (!(target instanceof Node) || !settingsPanel || !settingsToggle) {
            return;
        }
        if (!settingsPanel.contains(target) && !settingsToggle.contains(target)) {
            closeSettingsPanel();
        }
    });
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        if (typeof saved.themeIndex === "number" && THEME_ORDER[saved.themeIndex]) {
            state.themeIndex = saved.themeIndex;
        }
        if (typeof saved.fontScale === "number" && saved.fontScale >= FONT_SCALE_MIN && saved.fontScale <= FONT_SCALE_MAX) {
            state.fontScale = saved.fontScale;
        }
        if (typeof saved.currentChapter === "number") {
            state.currentChapterIndex = saved.currentChapter;
        }
        if (typeof saved.lineHeightScale === "number" && saved.lineHeightScale >= LINE_HEIGHT_MIN && saved.lineHeightScale <= LINE_HEIGHT_MAX) {
            state.lineHeightScale = saved.lineHeightScale;
        }
        if (typeof saved.widthScale === "number" && saved.widthScale >= WIDTH_MIN && saved.widthScale <= WIDTH_MAX) {
            state.widthScale = saved.widthScale;
        }
        if (saved.progressByChapter && typeof saved.progressByChapter === "object") {
            state.progressByChapter = saved.progressByChapter;
        }
    } catch (error) {
        console.warn("加载阅读设置信息失败", error);
    }
}

function persistSettings() {
    const payload = {
        themeIndex: state.themeIndex,
        fontScale: state.fontScale,
        lineHeightScale: state.lineHeightScale,
        widthScale: state.widthScale,
        currentChapter: state.currentChapterIndex,
        progressByChapter: state.progressByChapter
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("保存阅读设置失败", error);
    }
}

async function loadBook() {
    readerContent.innerHTML = "<p class=\"reading-status\">正在载入章节…</p>";
    try {
        const response = await fetch("novel.json", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`获取数据失败: ${response.status}`);
        }
        const book = await response.json();
        state.book = book;
        renderBookMeta(book);
        renderToc(book.chapters);
        const initialIndex = clamp(state.currentChapterIndex, 0, book.chapters.length - 1);
        jumpChapter(initialIndex, { silent: true });
    } catch (error) {
        console.error(error);
        readerContent.innerHTML = "<p class=\"reading-status error\">载入失败，请刷新重试。</p>";
    }
}

function renderBookMeta(book) {
    chapterLabel.textContent = book.chapters?.[state.currentChapterIndex]?.title || book.title || "小说阅读";
    if (bookTitleEl) {
        bookTitleEl.textContent = book.title || "云墨书库";
    }
    if (bookAuthorEl) {
        bookAuthorEl.textContent = book.author ? `作者：${book.author}` : "虚拟作者";
    }
}

function renderToc(chapters = []) {
    tocList.innerHTML = "";
    tocItems = chapters.map((chapter, index) => {
        const clone = tocTemplate.content.firstElementChild.cloneNode(true);
        const button = clone.querySelector(".toc-item");
        const title = button.querySelector(".toc-item-title");
        const progress = button.querySelector(".toc-item-progress");
        if (title) {
            title.textContent = chapter.title;
        } else {
            button.textContent = chapter.title;
        }
        const storedProgress = Number(state.progressByChapter[index] || 0);
        updateTocButtonProgress(progress, storedProgress);
        button.dataset.index = index;
        button.addEventListener("click", () => {
            body.classList.remove("sidebar-open");
            jumpChapter(index);
        });
        tocList.appendChild(clone);
        return { button, progress };
    });
    highlightActiveChapter();
}

function highlightActiveChapter() {
    tocItems.forEach((item, index) => {
        if (!item?.button) {
            return;
        }
        item.button.dataset.active = index === state.currentChapterIndex ? "true" : "false";
    });
}

function rotateTheme() {
    const nextIndex = (state.themeIndex + 1) % THEME_ORDER.length;
    applyTheme(nextIndex);
    state.themeIndex = nextIndex;
    syncThemeOptions();
    persistSettings();
}

function applyTheme(index) {
    THEME_ORDER.forEach(theme => body.classList.remove(theme));
    const target = THEME_ORDER[index] || THEME_ORDER[0];
    body.classList.add(target);
}

function adjustFont(step) {
    setFontScale(clamp(state.fontScale + step, FONT_SCALE_MIN, FONT_SCALE_MAX));
}

function setFontScale(value) {
    const nextScale = clamp(value, FONT_SCALE_MIN, FONT_SCALE_MAX);
    if (nextScale === state.fontScale) {
        return;
    }
    state.fontScale = nextScale;
    applyFontScale(nextScale);
    syncRangeControls();
    persistSettings();
}

function applyFontScale(scale) {
    const computed = (READER_BASE_FONT + scale).toFixed(2);
    document.documentElement.style.setProperty("--reader-font-size", `${computed}rem`);
}

function setLineHeight(value) {
    const next = clamp(value, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX);
    if (next === state.lineHeightScale) {
        return;
    }
    state.lineHeightScale = next;
    applyLineHeight(next);
    syncRangeControls();
    persistSettings();
}

function applyLineHeight(scale) {
    const computed = (READER_BASE_LINE_HEIGHT + scale).toFixed(2);
    document.documentElement.style.setProperty("--reader-line-height", computed);
}

function setWidth(value) {
    const next = clamp(value, WIDTH_MIN, WIDTH_MAX);
    if (next === state.widthScale) {
        return;
    }
    state.widthScale = next;
    applyWidth(next);
    syncRangeControls();
    persistSettings();
}

function applyWidth(scale) {
    const computed = READER_BASE_WIDTH + scale;
    document.documentElement.style.setProperty("--reader-max-width", `${computed}px`);
}

function jumpChapter(index, options = {}) {
    if (!state.book) {
        return;
    }
    const chapters = state.book.chapters || [];
    const targetIndex = clamp(index, 0, chapters.length - 1);
    state.currentChapterIndex = targetIndex;
    persistSettings();
    const chapter = chapters[targetIndex];
    if (!chapter) {
        return;
    }
    chapterLabel.textContent = chapter.title;
    highlightActiveChapter();
    updateNavState(chapters.length);
    if (!options.silent) {
        readerContent.focus({ preventScroll: true });
    }
    renderChapter(chapter);
}

function updateNavState(total) {
    prevButton.disabled = state.currentChapterIndex <= 0;
    nextButton.disabled = state.currentChapterIndex >= total - 1;
    prevButton.setAttribute("aria-disabled", String(prevButton.disabled));
    nextButton.setAttribute("aria-disabled", String(nextButton.disabled));
}

function renderChapter(chapter) {
    if (!chapter) {
        return;
    }
    readingArea.scrollTop = 0;
    readerContent.setAttribute("aria-busy", "true");
    readerContent.innerHTML = "";

    const titleElement = document.createElement("h2");
    titleElement.textContent = chapter.title;
    readerContent.appendChild(titleElement);

    const paragraphs = Array.isArray(chapter.content) ? [...chapter.content] : String(chapter.content || "").split(/\n+/);
    const queue = paragraphs.slice();
    const chunkSize = 4;
    const targetPercent = Number(state.progressByChapter[state.currentChapterIndex] || 0);

    applyProgress(0);

    function appendChunk() {
        const fragment = document.createDocumentFragment();
        let count = 0;
        while (queue.length > 0 && count < chunkSize) {
            const text = queue.shift();
            const paragraph = document.createElement("p");
            paragraph.textContent = text.trim();
            fragment.appendChild(paragraph);
            count += 1;
        }
        readerContent.appendChild(fragment);
        if (queue.length > 0) {
            window.requestAnimationFrame(appendChunk);
        } else {
            readerContent.setAttribute("aria-busy", "false");
            updateProgress();
            restoreScrollPosition(targetPercent);
        }
    }

    window.requestAnimationFrame(appendChunk);
}

function updateProgress() {
    const maxScroll = readingArea.scrollHeight - readingArea.clientHeight;
    const ratio = maxScroll <= 0 ? 1 : readingArea.scrollTop / maxScroll;
    const percent = Math.round(ratio * 100);
    applyProgress(percent);
    const previous = Number(state.progressByChapter[state.currentChapterIndex] || 0);
    if (previous !== percent) {
        state.progressByChapter[state.currentChapterIndex] = percent;
        updateTocProgress();
        persistSettings();
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function applyProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${percent}%`;
}

function sliderToScale(value) {
    return Number(value) * FONT_SCALE_STEP;
}

function sliderToLineHeight(value) {
    return Number(value) * LINE_HEIGHT_STEP;
}

function sliderToWidth(value) {
    return Number(value) * WIDTH_STEP;
}

function syncRangeControls() {
    if (!fontSizeSlider || !lineHeightSlider || !widthSlider) {
        return;
    }
    const fontSteps = Math.round(state.fontScale / FONT_SCALE_STEP);
    const lineHeightSteps = Math.round(state.lineHeightScale / LINE_HEIGHT_STEP);
    const widthSteps = Math.round(state.widthScale / WIDTH_STEP);
    fontSizeSlider.value = String(fontSteps);
    lineHeightSlider.value = String(lineHeightSteps);
    widthSlider.value = String(widthSteps);
    fontSizeValue.textContent = describeFontScale(state.fontScale);
    lineHeightValue.textContent = describeLineHeight(state.lineHeightScale);
    widthValue.textContent = describeWidth(state.widthScale);
}

function syncThemeOptions() {
    themeOptions.forEach((option, index) => {
        const isActive = index === state.themeIndex;
        option.setAttribute("aria-checked", String(isActive));
        if (isActive) {
            option.classList.add("is-active");
        } else {
            option.classList.remove("is-active");
        }
    });
}

function describeFontScale(scale) {
    if (scale <= -0.24) return "较小";
    if (scale < 0.16) return "中";
    if (scale < 0.32) return "偏大";
    return "较大";
}

function describeLineHeight(scale) {
    if (scale <= -0.08) return "紧凑";
    if (scale < 0.16) return "标准";
    return "宽松";
}

function describeWidth(scale) {
    if (scale <= -40) return "窄";
    if (scale >= 120) return "宽";
    return "适中";
}

function toggleSettingsPanel() {
    if (isSettingsOpen) {
        closeSettingsPanel();
    } else {
        openSettingsPanel();
    }
}

function openSettingsPanel() {
    settingsPanel?.setAttribute("data-open", "true");
    settingsPanel?.setAttribute("aria-hidden", "false");
    settingsToggle?.setAttribute("aria-expanded", "true");
    document.body.classList.add("settings-open");
    requestAnimationFrame(() => {
        fontSizeSlider?.focus({ preventScroll: true });
    });
    isSettingsOpen = true;
}

function closeSettingsPanel() {
    settingsPanel?.setAttribute("data-open", "false");
    settingsPanel?.setAttribute("aria-hidden", "true");
    settingsToggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("settings-open");
    isSettingsOpen = false;
}

function resetSettings() {
    setFontScale(0);
    setLineHeight(0);
    setWidth(0);
    syncRangeControls();
}

function handleGlobalKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
    }
    if (event.key === "Escape" && isSettingsOpen) {
        closeSettingsPanel();
        return;
    }
    if (event.key === "ArrowLeft") {
        jumpChapter(state.currentChapterIndex - 1);
    } else if (event.key === "ArrowRight") {
        jumpChapter(state.currentChapterIndex + 1);
    }
}

function updateTocProgress() {
    tocItems.forEach((item, index) => {
        if (!item?.progress) {
            return;
        }
        const percent = Number(state.progressByChapter[index] || 0);
        updateTocButtonProgress(item.progress, percent);
    });
}

function updateTocButtonProgress(node, percent) {
    if (!node) {
        return;
    }
    const clamped = clamp(percent, 0, 100);
    node.style.setProperty("--progress", String(clamped));
    node.setAttribute("data-label", `${clamped}%`);
}

function restoreScrollPosition(percent) {
    applyProgress(percent);
    updateTocProgress();
    requestAnimationFrame(() => {
        const maxScroll = readingArea.scrollHeight - readingArea.clientHeight;
        const targetScroll = maxScroll * (percent / 100);
        if (!Number.isFinite(targetScroll) || maxScroll <= 0) {
            return;
        }
        readingArea.scrollTop = targetScroll;
    });
}
