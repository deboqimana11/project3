const state = {
    book: null,
    currentChapterIndex: 0,
    themeIndex: 0,
    fontScale: 0
};

const THEME_ORDER = ["theme-light", "theme-sepia", "theme-dark"];
const FONT_SCALE_STEP = 0.08;
const FONT_SCALE_MIN = -0.4;
const FONT_SCALE_MAX = 0.7;
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

let tocButtons = [];
let scrollRaf = null;

init();

async function init() {
    loadSettings();
    applyTheme(state.themeIndex);
    applyFontScale(state.fontScale);
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
    } catch (error) {
        console.warn("加载阅读设置信息失败", error);
    }
}

function persistSettings() {
    const payload = {
        themeIndex: state.themeIndex,
        fontScale: state.fontScale,
        currentChapter: state.currentChapterIndex
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
}

function renderToc(chapters = []) {
    tocList.innerHTML = "";
    tocButtons = chapters.map((chapter, index) => {
        const clone = tocTemplate.content.firstElementChild.cloneNode(true);
        const button = clone.querySelector(".toc-item");
        button.textContent = chapter.title;
        button.dataset.index = index;
        button.addEventListener("click", () => {
            body.classList.remove("sidebar-open");
            jumpChapter(index);
        });
        tocList.appendChild(clone);
        return button;
    });
    highlightActiveChapter();
}

function highlightActiveChapter() {
    tocButtons.forEach((button, index) => {
        button.dataset.active = index === state.currentChapterIndex ? "true" : "false";
    });
}

function rotateTheme() {
    const nextIndex = (state.themeIndex + 1) % THEME_ORDER.length;
    applyTheme(nextIndex);
    state.themeIndex = nextIndex;
    persistSettings();
}

function applyTheme(index) {
    THEME_ORDER.forEach(theme => body.classList.remove(theme));
    const target = THEME_ORDER[index] || THEME_ORDER[0];
    body.classList.add(target);
}

function adjustFont(step) {
    const nextScale = clamp(state.fontScale + step, FONT_SCALE_MIN, FONT_SCALE_MAX);
    if (nextScale === state.fontScale) {
        return;
    }
    state.fontScale = nextScale;
    applyFontScale(nextScale);
    persistSettings();
}

function applyFontScale(scale) {
    const base = 1.1;
    const computed = (base + scale).toFixed(2);
    document.documentElement.style.setProperty("--reader-font-size", `${computed}rem`);
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
        }
    }

    window.requestAnimationFrame(appendChunk);
}

function updateProgress() {
    const maxScroll = readingArea.scrollHeight - readingArea.clientHeight;
    const ratio = maxScroll <= 0 ? 1 : readingArea.scrollTop / maxScroll;
    const percent = Math.round(ratio * 100);
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${percent}%`;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
