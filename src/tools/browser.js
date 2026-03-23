const path = require("path");
const fs = require("fs");
const config = require("../config");
const platform = require("../platform");

const DOWNLOADS_DIR = path.join(config.DATA_DIR, "downloads");
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

class BrowserManager {
  constructor() {
    this.browser = null;
    this.tabs = new Map(); // name -> Page
    this.activeTab = "main";
    this.idleTimer = null;
  }

  get page() { return this.tabs.get(this.activeTab) || null; }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), config.BROWSER_IDLE_TIMEOUT);
  }

  async setupPage(page) {
    // Randomize viewport slightly to avoid fingerprinting
    const w = 1280 + Math.floor(Math.random() * 40 - 20);
    const h = 720 + Math.floor(Math.random() * 20 - 10);
    await page.setViewport({ width: w, height: h });
    await page.setUserAgent(platform.userAgent);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      window.chrome = { runtime: {} };
    });
  }

  async ensureBrowser() {
    if (this.browser?.connected) {
      this.resetIdleTimer();
      return;
    }
    const puppeteer = require("puppeteer-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    puppeteer.use(StealthPlugin());

    const profileDir = path.join(config.DATA_DIR, "browser_profile");
    fs.mkdirSync(profileDir, { recursive: true });

    if (!platform.chromiumPath) {
      throw new Error("Chrome/Chromium not found. Set CHROMIUM_PATH env var or install Chrome.");
    }

    // Check for stale lock file
    const lockFile = path.join(profileDir, "SingletonLock");
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch {}
    }

    this.browser = await puppeteer.launch({
      executablePath: platform.chromiumPath,
      headless: "new",
      userDataDir: profileDir,
      args: [...platform.browserArgs,
        "--disable-blink-features=AutomationControlled",
        "--disable-background-networking",
        "--window-size=1280,720", "--lang=en-US,en",
      ],
    });

    const mainPage = await this.browser.newPage();
    await this.setupPage(mainPage);
    this.tabs.set("main", mainPage);
    this.activeTab = "main";

    this.browser.on("disconnected", () => {
      this.browser = null;
      this.tabs.clear();
    });
    this.resetIdleTimer();
  }

  async getPage() {
    await this.ensureBrowser();
    let page = this.tabs.get(this.activeTab);
    if (!page || page.isClosed()) {
      page = await this.browser.newPage();
      await this.setupPage(page);
      this.tabs.set(this.activeTab, page);
    }
    return page;
  }

  screenshotPath() {
    fs.mkdirSync(config.SCREENSHOTS_DIR, { recursive: true });
    return path.join(config.SCREENSHOTS_DIR, `screenshot_${Date.now()}.png`);
  }

  randomDelay(min = 800, max = 1800) {
    return new Promise(r => setTimeout(r, Math.random() * (max - min) + min));
  }

  async waitAndFind(page, selector, timeout = 10000) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout });
      return true;
    } catch {
      try { return !!(await page.$(selector)); } catch { return false; }
    }
  }

  // === Core browser actions ===

  async browseUrl(url) {
    try {
      if (!url.startsWith("http")) url = "https://" + url;
      const page = await this.getPage();
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      const title = await page.title();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath, fullPage: false });
      return { title, url: page.url(), screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async clickElement(selector) {
    try {
      const page = await this.getPage();
      const found = await this.waitAndFind(page, selector);
      if (!found) return { error: `Element not found: ${selector}` };
      await page.click(selector);
      await this.randomDelay();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async typeText(selector, text, clearFirst = true) {
    try {
      const page = await this.getPage();
      const found = await this.waitAndFind(page, selector);
      if (!found) return { error: `Element not found: ${selector}` };
      if (clearFirst) {
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press("Backspace");
      }
      await page.type(selector, text, { delay: 50 + Math.random() * 30 });
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async pressKey(key) {
    try {
      const page = await this.getPage();
      await page.keyboard.press(key);
      await this.randomDelay();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, key, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async scrollPage(direction = "down", amount = 500) {
    try {
      const page = await this.getPage();
      await page.evaluate((dir, amt) => window.scrollBy(0, dir === "down" ? amt : -amt), direction, amount);
      await new Promise(r => setTimeout(r, 500));
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async takeScreenshot() {
    try {
      const page = await this.getPage();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath, fullPage: false });
      return { title: await page.title(), url: page.url(), screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async getPageText(selector) {
    try {
      const page = await this.getPage();
      let text = selector
        ? await page.$eval(selector, el => el.innerText)
        : await page.evaluate(() => document.body.innerText);
      return { text: text || "", url: page.url() };
    } catch (err) { return { error: err.message }; }
  }

  async getPageHtml(selector) {
    try {
      const page = await this.getPage();
      let html = selector
        ? await page.$eval(selector, el => el.outerHTML)
        : await page.evaluate(() => document.body.innerHTML);
      return { html: (html || "").slice(0, 10000), url: page.url() };
    } catch (err) { return { error: err.message }; }
  }

  // === v5: Download / Upload ===

  async downloadFile({ selector }) {
    try {
      const page = await this.getPage();
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
      const before = new Set(fs.readdirSync(DOWNLOADS_DIR));

      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS_DIR });

      if (selector) {
        const found = await this.waitAndFind(page, selector);
        if (!found) return { error: `Download trigger not found: ${selector}` };
        await page.click(selector);
      }

      // Poll for new file (max 60s)
      let newFile = null;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 500));
        const after = fs.readdirSync(DOWNLOADS_DIR);
        const added = after.filter(f => !before.has(f) && !f.endsWith(".crdownload"));
        if (added.length) { newFile = added[0]; break; }
      }
      if (!newFile) return { error: "Download timed out (60s)" };

      const filePath = path.join(DOWNLOADS_DIR, newFile);
      const stats = fs.statSync(filePath);
      return { filePath, fileName: newFile, size: stats.size, documentPath: filePath, documentName: newFile };
    } catch (err) { return { error: err.message }; }
  }

  async uploadFile({ selector, filePath }) {
    try {
      const page = await this.getPage();
      const input = await page.waitForSelector(selector, { timeout: 10000 });
      if (!input) return { error: `File input not found: ${selector}` };
      await input.uploadFile(filePath);
      await this.randomDelay();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  // === v5: Complex UI ===

  async selectDropdown({ selector, value, text }) {
    try {
      const page = await this.getPage();
      const found = await this.waitAndFind(page, selector);
      if (!found) return { error: `Dropdown not found: ${selector}` };

      // Try native <select> first
      try {
        if (value) await page.select(selector, value);
        else if (text) {
          const optVal = await page.$eval(selector, (sel, t) => {
            for (const opt of sel.options) { if (opt.text.includes(t)) return opt.value; }
            return null;
          }, text);
          if (optVal) await page.select(selector, optVal);
          else throw new Error("Option not found in native select");
        }
      } catch {
        // Fallback: click dropdown, then find option by text
        await page.click(selector);
        await this.randomDelay(500, 1000);
        const searchText = text || value;
        const [option] = await page.$x(`//*[contains(text(), '${searchText}')]`);
        if (option) await option.click();
        else return { error: `Option "${searchText}" not found in dropdown` };
      }

      await this.randomDelay();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async checkBox({ selector, checked }) {
    try {
      const page = await this.getPage();
      const found = await this.waitAndFind(page, selector);
      if (!found) return { error: `Checkbox not found: ${selector}` };
      const current = await page.$eval(selector, el => el.checked);
      if (current !== checked) await page.click(selector);
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, checked, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async findByText({ text, tag, click }) {
    try {
      const page = await this.getPage();
      const xpath = `//${tag || "*"}[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
      const elements = await page.$x(xpath);
      if (!elements.length) return { found: false, count: 0 };

      if (click) {
        await elements[0].click();
        await this.randomDelay();
      }
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { found: true, count: elements.length, clicked: !!click, screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async executeJS({ code }) {
    try {
      const page = await this.getPage();
      const result = await page.evaluate(code);
      return { result: JSON.stringify(result) };
    } catch (err) { return { error: err.message }; }
  }

  // === v5: Tab Management ===

  async openTab({ name, url }) {
    try {
      await this.ensureBrowser();
      const page = await this.browser.newPage();
      await this.setupPage(page);
      this.tabs.set(name, page);
      this.activeTab = name;
      if (url) {
        if (!url.startsWith("http")) url = "https://" + url;
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      }
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, tab: name, url: page.url(), screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async switchTab({ name }) {
    try {
      if (!this.tabs.has(name)) return { error: `Tab "${name}" not found` };
      this.activeTab = name;
      const page = this.tabs.get(name);
      await page.bringToFront();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath });
      return { success: true, tab: name, url: page.url(), screenshotPath: ssPath };
    } catch (err) { return { error: err.message }; }
  }

  async closeTab({ name }) {
    try {
      if (!this.tabs.has(name)) return { error: `Tab "${name}" not found` };
      const page = this.tabs.get(name);
      await page.close();
      this.tabs.delete(name);
      if (this.activeTab === name) {
        this.activeTab = this.tabs.keys().next().value || "main";
      }
      return { success: true, closed: name, activeTab: this.activeTab };
    } catch (err) { return { error: err.message }; }
  }

  async listTabs() {
    const result = [];
    for (const [name, page] of this.tabs) {
      try {
        result.push({ name, url: page.url(), title: await page.title(), active: name === this.activeTab });
      } catch {
        result.push({ name, url: "closed", active: false });
      }
    }
    return { tabs: result };
  }

  // === v5: Popup Handling ===

  async handlePopup({ action }) {
    try {
      await this.ensureBrowser();
      const pages = await this.browser.pages();

      if (action === "switch") {
        const popup = pages[pages.length - 1];
        if (popup) {
          this.tabs.set("popup", popup);
          this.activeTab = "popup";
          await popup.bringToFront();
          const ssPath = this.screenshotPath();
          await popup.screenshot({ path: ssPath });
          return { success: true, url: popup.url(), screenshotPath: ssPath };
        }
        return { error: "No popup found" };
      }

      if (action === "close") {
        const popup = this.tabs.get("popup");
        if (popup && !popup.isClosed()) await popup.close();
        this.tabs.delete("popup");
        this.activeTab = "main";
        return { success: true, message: "Popup closed, switched to main tab" };
      }

      return { error: `Unknown action: ${action}` };
    } catch (err) { return { error: err.message }; }
  }

  // === Existing utility methods ===

  async solveCaptcha() {
    try {
      const page = await this.getPage();
      const ssPath = this.screenshotPath();
      await page.screenshot({ path: ssPath, fullPage: false });
      return { screenshotPath: ssPath, message: "CAPTCHA detected. Please solve it manually.", needsHumanHelp: true };
    } catch (err) { return { error: err.message }; }
  }

  async clearBrowserData() {
    await this.close();
    const profileDir = path.join(config.DATA_DIR, "browser_profile");
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
      return { success: true, message: "Browser data cleared." };
    } catch (err) { return { error: err.message }; }
  }

  async close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.browser) { try { await this.browser.close(); } catch {} }
    this.browser = null;
    this.tabs.clear();
  }
}

module.exports = new BrowserManager();
