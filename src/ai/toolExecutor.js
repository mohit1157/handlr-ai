const fs = require("fs");
const path = require("path");
const { runShell } = require("../tools/shell");
const browser = require("../tools/browser");
const { getSystemStatus } = require("../tools/status");
const { saveMemory, recallMemory } = require("../memory/longTermMemory");
const { createDocument, createExcel, readExcel, readPDF } = require("../tools/documents");
const email = require("../tools/email");
const { startSessionApproval } = require("../security/approval");
const tasks = require("../memory/tasks");
const selfMod = require("../tools/selfModify");
const { setModel } = require("./providers");
const config = require("../config");

let _bot = null;
let _chatId = null;
function setContext(bot, chatId) { _bot = bot; _chatId = chatId; }

const handlers = {
  // === Core ===
  async run_shell_command({ command, timeout_ms }) {
    const result = await runShell(command, timeout_ms);
    return { output: result.output, exitCode: result.code };
  },
  async get_system_status() { return { status: await getSystemStatus() }; },

  // === Files ===
  async read_file({ path: filePath, max_lines }) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return { content, totalLines: content.split("\n").length };
    } catch (err) { return { error: err.message }; }
  },
  async write_file({ path: filePath, content }) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      return { success: true, path: filePath, bytes: Buffer.byteLength(content) };
    } catch (err) { return { error: err.message }; }
  },
  async list_files({ path: dirPath }) {
    try {
      const target = dirPath || ".";
      const entries = fs.readdirSync(target, { withFileTypes: true });
      return { path: target, items: entries.map(e => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" })) };
    } catch (err) { return { error: err.message }; }
  },

  // === Browser Core ===
  async browse_url({ url }) { return await browser.browseUrl(url); },
  async click_element({ selector }) { return await browser.clickElement(selector); },
  async type_text({ selector, text, clear_first }) { return await browser.typeText(selector, text, clear_first !== false); },
  async take_screenshot() { return await browser.takeScreenshot(); },
  async get_page_text({ selector }) { return await browser.getPageText(selector); },
  async get_page_html({ selector }) { return await browser.getPageHtml(selector); },
  async press_key({ key }) { return await browser.pressKey(key); },
  async scroll_page({ direction, amount }) { return await browser.scrollPage(direction || "down", amount || 500); },
  async solve_captcha() { return await browser.solveCaptcha(); },
  async clear_browser_data() { return await browser.clearBrowserData(); },

  // === Browser v5: Download/Upload ===
  async download_file({ selector }) { return await browser.downloadFile({ selector }); },
  async upload_file({ selector, file_path }) { return await browser.uploadFile({ selector, filePath: file_path }); },

  // === Browser v5: Complex UI ===
  async select_dropdown({ selector, value, text }) { return await browser.selectDropdown({ selector, value, text }); },
  async check_box({ selector, checked }) { return await browser.checkBox({ selector, checked }); },
  async find_by_text({ text, tag, click }) { return await browser.findByText({ text, tag, click }); },
  async execute_js({ code }) { return await browser.executeJS({ code }); },

  // === Browser v5: Tabs ===
  async open_tab({ name, url }) { return await browser.openTab({ name, url }); },
  async switch_tab({ name }) { return await browser.switchTab({ name }); },
  async close_tab({ name }) { return await browser.closeTab({ name }); },
  async list_tabs() { return await browser.listTabs(); },
  async handle_popup({ action }) { return await browser.handlePopup({ action }); },

  // === Vision ===
  async analyze_screenshot({ image_path, question }) {
    const { analyzeScreenshot } = require("../tools/vision");
    return await analyzeScreenshot({ screenshotPath: image_path, question });
  },

  // === Images ===
  async process_image({ input_path, output_path, operations }) {
    const { processImage } = require("../tools/images");
    return await processImage({ inputPath: input_path, outputPath: output_path, operations });
  },

  // === OTP ===
  async request_otp({ site, type }) {
    if (!_bot || !_chatId) return { error: "No bot context" };
    const otpType = type || "sms";
    await _bot.sendMessage(_chatId, `🔐 ${site} is asking for a ${otpType} verification code.\nPlease reply with the code:`);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        _bot.removeListener("message", handler);
        resolve({ error: "OTP timeout (120s)" });
      }, 120000);
      const handler = (msg) => {
        if (msg.chat.id === _chatId && msg.text && !msg.text.startsWith("/")) {
          clearTimeout(timeout);
          _bot.removeListener("message", handler);
          resolve({ code: msg.text.trim(), site });
        }
      };
      _bot.on("message", handler);
    });
  },

  // === Memory ===
  async save_memory({ key, value }) { return saveMemory(key, value); },
  async recall_memory({ key }) { return recallMemory(key); },

  // === Email ===
  async configure_email(args) { return await email.configureEmail(args); },
  async send_email(args) { return await email.sendEmail(args); },
  async check_email(args) { return await email.checkEmail(args); },
  async reply_email(args) { return await email.replyEmail(args); },
  async search_email(args) { return await email.searchEmail(args); },

  // === Documents ===
  async create_document({ type, title, sections }) {
    try {
      const filePath = await createDocument({ type, title, sections });
      return { success: true, documentPath: filePath, documentName: path.basename(filePath) };
    } catch (err) { return { error: err.message }; }
  },
  async create_excel({ title, sheets }) {
    try {
      const filePath = await createExcel({ title, sheets });
      return { success: true, documentPath: filePath, documentName: path.basename(filePath) };
    } catch (err) { return { error: err.message }; }
  },
  async read_excel({ path: filePath, sheet }) {
    try { return await readExcel({ filePath, sheetName: sheet }); }
    catch (err) { return { error: err.message }; }
  },
  async read_pdf({ path: filePath }) {
    try { return await readPDF({ filePath }); }
    catch (err) { return { error: err.message }; }
  },

  // === Credentials ===
  async save_credential(args) {
    const { saveCredential } = require("../tools/credentials");
    return saveCredential(args);
  },
  async get_credential(args) {
    const { getCredential } = require("../tools/credentials");
    return getCredential(args);
  },
  async list_credentials() {
    const { listCredentials } = require("../tools/credentials");
    return listCredentials();
  },

  // === Calendar ===
  async configure_calendar(args) {
    const cal = require("../tools/calendar");
    return await cal.configureCalendar(args);
  },
  async list_calendar_events(args) {
    const cal = require("../tools/calendar");
    return await cal.listEvents(args);
  },
  async create_calendar_event(args) {
    const cal = require("../tools/calendar");
    return await cal.createEvent(args);
  },
  async update_calendar_event(args) {
    const cal = require("../tools/calendar");
    return await cal.updateEvent(args);
  },
  async delete_calendar_event(args) {
    const cal = require("../tools/calendar");
    return await cal.deleteEvent(args);
  },

  // === Email v6 ===
  async read_email_body(args) {
    const email = require("../tools/email");
    return await email.readEmail(args);
  },

  // === Browser v6 ===
  async analyze_form() {
    const result = await browser.executeJS(`
      (() => {
        const forms = [];
        document.querySelectorAll('form, [role="form"]').forEach((form, fi) => {
          const fields = [];
          form.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"]').forEach(el => {
            const label = el.labels?.[0]?.textContent?.trim()
              || el.getAttribute('aria-label')
              || el.getAttribute('placeholder')
              || el.getAttribute('name')
              || '';
            fields.push({
              type: el.type || el.tagName.toLowerCase(),
              name: el.name || el.id || '',
              label,
              selector: el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : ''),
              required: el.required || el.getAttribute('aria-required') === 'true',
              value: el.value || '',
            });
          });
          forms.push({ action: form.action, method: form.method, fields });
        });
        // Also scan for inputs outside forms
        const orphans = [];
        document.querySelectorAll('input:not(form input), select:not(form select), textarea:not(form textarea)').forEach(el => {
          const label = el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
          orphans.push({
            type: el.type || el.tagName.toLowerCase(),
            name: el.name || el.id || '',
            label,
            selector: el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : ''),
            required: el.required,
            value: el.value || '',
          });
        });
        if (orphans.length) forms.push({ action: 'standalone', method: 'n/a', fields: orphans });
        return forms;
      })()
    `);
    return result;
  },

  async wait_for_element({ selector, timeout_ms }) {
    const timeout = Math.min(timeout_ms || 10000, 30000);
    await browser.ensureBrowser();
    const page = browser.page;
    if (!page) return { error: "No active browser page" };
    try {
      await page.waitForSelector(selector, { visible: true, timeout });
      return { found: true, selector };
    } catch {
      return { found: false, selector, message: `Element "${selector}" not found within ${timeout}ms` };
    }
  },

  // === Model / Code / Tasks / Approval ===
  async switch_model({ model }) { return { success: true, message: `Switched to: ${setModel(model).model}` }; },
  async self_modify(args) { return selfMod.modifyAndRestart(args); },
  async rollback_code() { return selfMod.rollback(); },
  async create_task(args) { return tasks.createTask(args); },
  async update_task(args) { return tasks.updateTask(args); },
  async get_task(args) { return tasks.getTask(args); },
  async list_tasks() { return tasks.listTasks(); },
  async request_session_approval({ reason, minutes }) {
    if (!_bot || !_chatId) return { error: "No bot context" };
    const mins = minutes || 1440;
    startSessionApproval(_chatId, "session", { minutes: mins });
    return { approved: true, minutes: mins, message: `Session approval active for ${mins} minutes.` };
  },
};

async function executeTool(name, args) {
  const handler = handlers[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  try { return await handler(args); }
  catch (err) { return { error: err.message }; }
}

module.exports = { executeTool, setContext };
