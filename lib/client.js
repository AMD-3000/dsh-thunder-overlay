// dsh-thunder-overlay — browser half.
//
// 挂点：`shell.overlay`（全屏浮层，z-index 20，盖在所有列之上、不在滚动容器里）。
// 触发：当前会话 running 时冒一记"雷霆大白字"，随后每次新的 tool/call 换一次词。
// 纯视觉，不拦指针（pointer-events: none），不改任何业务状态。
//
// 这个文件是手写的 lazy-CJS 客户端模块（与 @deepseek-ai/dsh-client-ui-* 的产物同一种
// 信封格式），由模块加载器在浏览器里执行，不需要任何编译步骤。

window.__ModuleLoader__.load({
	id: 'dsh-thunder-overlay',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		var React = require('react');
		var h = React.createElement;

		var EMPTY_MAP = new Map();

		// React 18 的 useSyncExternalStore；万一宿主更老，退化成一个安全的订阅 hook。
		var useStore = typeof React.useSyncExternalStore === "function"
			? React.useSyncExternalStore
			: function (subscribe, getSnapshot) {
				var pair = React.useState(function () { return getSnapshot(); });
				var value = pair[0];
				var setValue = pair[1];
				React.useEffect(function () {
					var active = true;
					var update = function () { if (active) setValue(getSnapshot()); };
					update();
					var unsubscribe = subscribe(update);
					return function () { active = false; if (typeof unsubscribe === "function") unsubscribe(); };
				}, [subscribe, getSnapshot]);
				return value;
			};

		// ── 默认配置（可用 window.__dshThunder 覆盖，见 README）──────────────
		var DEFAULTS = {
			enabled: true,
			mode: 'action',          // 'action' 大字跟随当前动作；'fixed' 永远写 word
			word: '雷霆嘎巴',             // mode=fixed 时的大字；也是开场/无动作时的字
			openingWord: '开始挑战',      // 用户发消息时弹的字
			busyWord: '大肥鱼',         // 智能体进入忙碌状态时弹的字（设置页可改）
			finishWord: '挑战成功',       // 智能体干完活时弹的字（设置页可改）
			openingDetail: 'DSH 介入',
			detail: true,            // 是否显示下方小字（工具名 + 参数预览）
			duration: 500,           // 单次白字停留（毫秒）：立即出现，0.5 秒内消失
			cooldown: 0,             // 两次白字之间的最小间隔（毫秒）：0 = 新动作立即顶掉旧的
			scale: 1,                // 字号倍率
			veil: 0.42,              // 背景压暗程度 0~1
			showBolt: false,         // 是否显示闪电（默认关）
			showStart: true,         // 用户发消息时弹「开始」
			showBusy: true,          // 智能体进入忙碌时弹「忙碌文案」
			showActions: true,       // 工具调用时弹动作词
			showFinish: true,        // 智能体完成工作时弹「完成文案」
			remoteFont: true,        // 运行时从 GitHub 抓 Endfield 字体（不随包分发）
			debug: true,             // 每次冒字都往浏览器控制台打一行，便于核验
			backdrop: 'blur',        // 'blur' 背景模糊 | 'solid' 整屏色块 | 'veil' 暗角压暗
			backdropBlur: 18,        // blur 模式的模糊半径（px）
			backdropDim: 0.12,       // blur 模式的压暗量 0~1（0 = 完全不压）
			backdropColor: '#0e1116',// solid 模式的底色
			backdropAlpha: 0.94      // solid 模式的不透明度 0~1
		};

		// wire 工具名 → 大字（短语，字数不固定，字号按字数自适应铺满屏宽）
		var TOOL_WORDS = {
			bash: '执行命令', run_code: '执行代码', pwsh: '执行命令', ssh_exec: '远程执行', ssh_cluster: '远程执行',
			read: '查看文件', read_image: '查看图片',
			write: '写入文件', edit: '修改文件', str_replace_editor: '修改文件',
			glob: '搜索文件', grep: '搜索内容', remote_search: '搜索内容', remote_ls: '列目录',
			web_search: '网络搜索', web_fetch: '抓取网页',
			subagent: '派出助手', subagent_fork: '派出助手', workflow: '编排流程',
			todo_write: '整理计划', present: '交付成果', ask_user_question: '询问用户',
			create_goal: '设定目标', update_goal: '设定目标', get_goal: '查看目标',
			schedule_create: '安排定时', schedule_update: '安排定时', schedule_delete: '取消定时',
			job_list: '查看任务', job_output: '读取任务', job_kill: '终止任务',
			skill: '加载技能', working_directory: '切换目录',
			cordis_inspect_list: '检查插件', cordis_inspect_query: '检查插件'
		};

		function hexToRgba(hex, alpha) {
			var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
			if (!m) return 'rgba(43,90,80,' + alpha + ')';
			var n = parseInt(m[1], 16);
			return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
		}

		function clamp(value, low, high) {
			return value < low ? low : value > high ? high : value;
		}

		function normalize(config) {
			var merged = {};
			var key;
			for (key in DEFAULTS) merged[key] = DEFAULTS[key];
			if (config && typeof config === 'object') {
				for (key in config) if (config[key] !== undefined) merged[key] = config[key];
			}
			var override = typeof window !== 'undefined' ? window.__dshThunder : undefined;
			if (override && typeof override === 'object') {
				for (key in override) if (override[key] !== undefined) merged[key] = override[key];
			}
			merged.labels = merged.labels && typeof merged.labels === 'object' ? merged.labels : {};
			merged.duration = clamp(Number(merged.duration) || DEFAULTS.duration, 500, 20000);
			merged.cooldown = clamp(Number(merged.cooldown) || 0, 0, 10000);
			merged.scale = clamp(Number(merged.scale) || 1, 0.3, 3);
			merged.veil = clamp(Number(merged.veil), 0, 1);
			if (Number.isNaN(merged.veil)) merged.veil = DEFAULTS.veil;
			return merged;
		}

		// tool/call 的 arguments 是流式 JSON 片段，可能不完整：能解析就取第一个字符串值。
		function preview(raw) {
			if (typeof raw !== 'string' || raw.length === 0) return '';
			var text = raw.trim();
			var value = '';
			try {
				var parsed = JSON.parse(text);
				if (parsed && typeof parsed === 'object') {
					var priority = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt'];
					var i;
					for (i = 0; i < priority.length; i += 1) {
						var candidate = parsed[priority[i]];
						if (typeof candidate === 'string' && candidate.length > 0) { value = candidate; break; }
					}
					if (!value) {
						for (var name in parsed) {
							if (typeof parsed[name] === 'string' && parsed[name].length > 0) { value = parsed[name]; break; }
						}
					}
				}
			} catch (error) {
				var match = /"(?:command|file_path|path|pattern|query|url|description|prompt)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
				if (match) value = match[1];
			}
			value = value.replace(/\s+/g, ' ').trim();
			if (value.length > 64) value = value.slice(0, 63) + '…';
			return value;
		}

		function bindingOf(ctx, sessionId) {
			try {
				if (!ctx.sessions || typeof ctx.sessions.binding !== 'function') return undefined;
				return ctx.sessions.binding(sessionId);
			} catch (error) {
				return undefined;
			}
		}

		function windowOf(binding) {
			try {
				if (!binding || !binding.eventSource || typeof binding.eventSource.getSnapshot !== 'function') return undefined;
				return binding.eventSource.getSnapshot();
			} catch (error) {
				return undefined;
			}
		}

		// 基线：进入工作状态那一刻的事件窗口末尾 seq，之前的旧工具调用一概不算。
		function baselineSeq(binding) {
			var win = windowOf(binding);
			var entries = (win && win.entries) || [];
			for (var i = entries.length - 1; i >= 0; i -= 1) {
				var event = entries[i] && entries[i].event;
				if (event && typeof event.seq === 'number') return event.seq;
			}
			return 0;
		}

		// 基线之后最近一次 tool/call → 大白字 + 小字。
		function readWork(ctx, sessionId, cfg, baseline) {
			var name = '';
			var raw = '';
			var seq = baseline;
			var win = windowOf(bindingOf(ctx, sessionId));
			var entries = (win && win.entries) || [];
			for (var i = entries.length - 1; i >= 0; i -= 1) {
				var event = entries[i] && entries[i].event;
				if (!event || typeof event.seq !== 'number') continue;
				if (event.seq <= baseline) break;
				if (event.type === 'tool/call') {
					name = (event.data && event.data.name) || '';
					raw = (event.data && event.data.arguments) || '';
					seq = event.seq;
					break;
				}
			}
			var label = name ? (cfg.labels[name] || TOOL_WORDS[name] || '执行') : '';
			var word = cfg.mode === 'fixed' ? cfg.word : (label || cfg.word);
			var detail = '';
			if (name) detail = String(name).toUpperCase() + (raw ? ' · ' + preview(raw) : '');
			else if (cfg.openingDetail) detail = cfg.openingDetail;
			return { word: word, detail: detail, seq: seq, name: name };
		}

		// ── 样式 ────────────────────────────────────────────────────────────
		// 大字：Noto Sans SC Black，只内嵌词表用到的 69 个汉字（woff2 子集，约 12KB）。
		var FONT_CSS_BLACK = "@font-face{font-family:'NotoSansSCBlack';src:url(data:font/woff2;base64,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) format('woff2');font-weight:900;font-display:swap}";

		// Endfield 不打包进 npm 包：运行时从字体作者仓库抓取（可关闭），抓不到就退回系统字体。
		var REMOTE_FONT_KEY = 'dsh-thunder-overlay:font';
		var REMOTE_FONT_URLS = [
			'https://cdn.jsdelivr.net/gh/lhclbt/Endfield_Font@main/EndfieldByButan.ttf',
			'https://raw.githubusercontent.com/lhclbt/Endfield_Font/main/EndfieldByButan.ttf'
		];
		var remoteFontPromise = null;
		var debugLog = false;

		function bufferToBase64(buffer) {
			var bytes = new Uint8Array(buffer);
			var chunk = '';
			for (var i = 0; i < bytes.length; i += 1) chunk += String.fromCharCode(bytes[i]);
			return window.btoa(chunk);
		}

		function base64ToBuffer(text) {
			var binary = window.atob(text);
			var bytes = new Uint8Array(binary.length);
			for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			return bytes.buffer;
		}

		function loadRemoteFont() {
			if (remoteFontPromise) return remoteFontPromise;
			remoteFontPromise = (async function () {
				if (typeof document === 'undefined' || !document.fonts || typeof FontFace !== 'function') return false;
				var cached = null;
				try { cached = window.localStorage && window.localStorage.getItem(REMOTE_FONT_KEY); } catch (error) { cached = null; }
				if (cached) {
					try {
						var cachedFace = new FontFace('EndfieldRemote', base64ToBuffer(cached));
						await cachedFace.load();
						document.fonts.add(cachedFace);
						if (debugLog) console.warn('[dsh-thunder-overlay] remote font ready (cache)');
						return true;
					} catch (error) { /* 缓存损坏则重新抓 */ }
				}
				for (var i = 0; i < REMOTE_FONT_URLS.length; i += 1) {
					try {
						var response = await fetch(REMOTE_FONT_URLS[i], { mode: 'cors' });
						if (!response.ok) continue;
						var buffer = await response.arrayBuffer();
						var face = new FontFace('EndfieldRemote', buffer);
						await face.load();
						document.fonts.add(face);
						if (debugLog) console.warn('[dsh-thunder-overlay] remote font ready', REMOTE_FONT_URLS[i]);
						try { window.localStorage.setItem(REMOTE_FONT_KEY, bufferToBase64(buffer)); } catch (error) { /* 配额满了就算了 */ }
						return true;
					} catch (error) { /* 换下一个源 */ }
				}
				if (debugLog) console.warn('[dsh-thunder-overlay] remote font failed, fallback to system font');
				return false;
			})();
			return remoteFontPromise;
		}

		// 设置页样式（跟随主题 token）。
		var SETTINGS_CSS = [
			'.dsh-thunder-settings{padding:18px 16px 40px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;overflow:auto;height:100%;box-sizing:border-box}',
			'.dsh-thunder-settings h2{margin:0 0 6px;font-size:17px;font-weight:600;letter-spacing:-.01em}',
			'.dsh-thunder-settings .dsh-thunder-intro{margin:0 0 14px;color:var(--dsw-alias-label-secondary);font-size:12.5px}',
			'.dsh-thunder-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
			'.dsh-thunder-row:last-of-type{border-bottom:none}',
			'.dsh-thunder-row-label{min-width:0}',
			'.dsh-thunder-row-hint{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11.5px}',
			'.dsh-thunder-switch{position:relative;width:42px;height:24px;border-radius:12px;border:none;padding:0;cursor:pointer;background:var(--dsw-alias-border-l2);transition:background .15s;flex:none}',
			'.dsh-thunder-switch[data-on="true"]{background:var(--dsw-alias-brand-primary)}',
			'.dsh-thunder-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}',
			'.dsh-thunder-switch[data-on="true"]::after{left:21px}',
			'.dsh-thunder-slider{display:flex;align-items:center;gap:10px;flex:none}',
			'.dsh-thunder-slider input[type="range"]{width:126px;accent-color:var(--dsw-alias-brand-primary)}',
			'.dsh-thunder-val{min-width:46px;text-align:right;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}',
			'.dsh-thunder-seg{display:flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;flex:none}',
			'.dsh-thunder-seg button{border:0;padding:5px 10px;font-size:12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.dsh-thunder-seg button[data-active="true"]{background:var(--dsw-alias-brand-primary);color:#fff}',
			'.dsh-thunder-word-input{width:118px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;box-sizing:border-box}',
			'.dsh-thunder-color{width:44px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;flex:none}',
			'.dsh-thunder-test{margin:20px 10px 0 0;padding:7px 16px;border-radius:8px;border:none;background:var(--dsw-alias-brand-primary);color:#fff;font-size:13px;cursor:pointer}',
			'.dsh-thunder-test:active{opacity:.85}',
			'.dsh-thunder-reset{margin-top:20px;padding:7px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}',
			'.dsh-thunder-reset:active{background:var(--dsw-alias-bg-layer-2)}'
		].join('');

		function buildCss() {
			return [
				FONT_CSS_BLACK,
				'.dsh-thunder{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;',
				'font-family:"NotoSansSCBlack","EndfieldRemote","PingFang SC","HarmonyOS Sans","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif}',
				'.dsh-thunder__veil{position:absolute;inset:0;opacity:0;',
				'animation:dshThVeil var(--dsh-thunder-dur) linear both}',
				'@keyframes dshThVeil{0%{opacity:1}55%{opacity:1}100%{opacity:0}}',
				'.dsh-thunder__stage{position:relative;display:flex;align-items:center;max-width:100%;padding:env(safe-area-inset-top) calc(4vw + env(safe-area-inset-right)) env(safe-area-inset-bottom) calc(4vw + env(safe-area-inset-left))}',
				'.dsh-thunder__copy{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}',
				'.dsh-thunder__word{position:relative;color:#fff;font-weight:900;line-height:1;letter-spacing:-.03em;white-space:nowrap;',
				'text-shadow:0 .035em .1em rgba(0,0,0,.42),0 .01em .02em rgba(0,0,0,.3),0 0 1px #fff;',
				'animation:dshThWord var(--dsh-thunder-dur) linear both}',
				'@keyframes dshThWord{0%{opacity:1}45%{opacity:1}100%{opacity:0}}',
				'.dsh-thunder__detail{position:absolute;left:50%;top:calc(100% + 14px);transform:translateX(-50%);font:600 clamp(10px,1.35vw,17px)/1.25 "EndfieldRemote",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;',
				'letter-spacing:.34em;padding-left:.34em;text-transform:uppercase;color:#fff;text-shadow:0 0 2px rgba(0,0,0,.95),0 2px 10px rgba(0,0,0,.8),0 0 22px rgba(0,0,0,.6);white-space:nowrap;text-align:center;',
				'max-width:min(78vw,900px);overflow:hidden;text-overflow:ellipsis;',
				'animation:dshThDetail var(--dsh-thunder-dur) linear both}',
				'@keyframes dshThDetail{0%{opacity:1}45%{opacity:1}100%{opacity:0}}'
			].join('') + SETTINGS_CSS;
		}

		function injectCss(text) {
			if (typeof document === 'undefined') return function () {};
			var cssId = 'dsh-thunder-overlay/thunder.css';
			var tag = document.querySelector('style[data-plugin-css="' + cssId + '"]');
			var created = false;
			if (!tag) {
				tag = document.createElement('style');
				tag.dataset.plugin = 'dsh-thunder-overlay';
				tag.dataset.pluginCss = cssId;
				document.head.appendChild(tag);
				created = true;
			}
			try {
				tag.textContent = text;
			} catch (error) {
				if (created) tag.remove();
				throw error;
			}
			return function () { tag.remove(); };
		}

		// ── 状态源 ──────────────────────────────────────────────────────────
		function useStatusMap(uiSession) {
			var subscribe = React.useCallback(function (changed) {
				if (!uiSession || !uiSession.sessionStatus) return function () {};
				return uiSession.sessionStatus.subscribe(changed);
			}, [uiSession]);
			var getSnapshot = React.useCallback(function () {
				if (!uiSession || !uiSession.sessionStatus) return EMPTY_MAP;
				return uiSession.sessionStatus.getSnapshot();
			}, [uiSession]);
			return useStore(subscribe, getSnapshot, function () { return EMPTY_MAP; });
		}

		function useCurrentSessionKey(uiSession) {
			var source = (uiSession && ((uiSession.adapter && uiSession.adapter.current) || uiSession.current)) || null;
			var subscribe = React.useCallback(function (changed) {
				if (!source || typeof source.subscribe !== 'function') return function () {};
				return source.subscribe(changed);
			}, [source]);
			var getSnapshot = React.useCallback(function () {
				if (!source || typeof source.getSnapshot !== 'function') return null;
				try {
					var value = source.getSnapshot();
					return value && typeof value.key === 'string' ? value.key : null;
				} catch (error) {
					return null;
				}
			}, [source]);
			return useStore(subscribe, getSnapshot, function () { return null; });
		}

		// ── 设置存储（localStorage，即时生效）────────────────────────────────
		var SETTINGS_KEY = 'dsh-thunder-overlay:config';

		function loadStored(cfg) {
			try {
				var raw = window.localStorage && window.localStorage.getItem(SETTINGS_KEY);
				if (!raw) return;
				var saved = JSON.parse(raw);
				for (var key in saved) if (saved[key] !== undefined && key in DEFAULTS) cfg[key] = saved[key];
			} catch (error) { /* 存储不可用时静默 */ }
		}

		function persist(cfg) {
			try {
				var out = {};
				for (var key in DEFAULTS) out[key] = cfg[key];
				window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(out));
			} catch (error) { /* 存储不可用时静默 */ }
		}

		function createStore(cfg) {
			var listeners = new Set();
			var store = {
				cfg: cfg,
				version: 0,
				subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
				getVersion: function () { return store.version; },
				pulse: 0,
				triggerTest: function () {
					store.pulse += 1;
					store.version += 1;
					listeners.forEach(function (fn) { fn(); });
				},
				update: function (patch) {
					for (var key in patch) cfg[key] = patch[key];
					store.version += 1;
					persist(cfg);
					listeners.forEach(function (fn) { fn(); });
				}
			};
			return store;
		}

		// ── 设置页 ──────────────────────────────────────────────────────────
		function SettingsPage(props) {
			var store = props.store;
			useStore(store.subscribe, store.getVersion);
			var cfg = store.cfg;

			function row(label, control, hint) {
				return h('div', { className: 'dsh-thunder-row' },
					h('div', { className: 'dsh-thunder-row-label' },
						h('div', null, label),
						hint ? h('div', { className: 'dsh-thunder-row-hint' }, hint) : null),
					control);
			}

			function toggle(onClick) {
				return h('button', {
					className: 'dsh-thunder-switch',
					'data-on': String(!!onClick.value),
					role: 'switch',
					'aria-checked': String(!!onClick.value),
					onClick: function () { store.update(onClick.patch(!onClick.value)); }
				});
			}

			function slider(value, min, max, step, format, patch) {
				return h('div', { className: 'dsh-thunder-slider' },
					h('input', {
						type: 'range', min: min, max: max, step: step, value: value,
						onChange: function (event) { store.update(patch(Number(event.target.value))); }
					}),
					h('span', { className: 'dsh-thunder-val' }, format(value)));
			}

			function segmented(value, options, patch) {
				return h('div', { className: 'dsh-thunder-seg' }, options.map(function (option) {
					return h('button', {
						key: option.value,
						'data-active': String(value === option.value),
						onClick: function () { store.update(patch(option.value)); }
					}, option.label);
				}));
			}

			var seconds = function (value) { return (value / 1000).toFixed(1) + 's'; };
			var millis = function (value) { return String(value) + 'ms'; };
			var pixels = function (value) { return String(value) + 'px'; };
			var percent = function (value) { return Math.round(value * 100) + '%'; };
			var times = function (value) { return Number(value).toFixed(2) + '×'; };

			return h('div', { className: 'dsh-thunder-settings' },
				h('h2', null, '雷霆大白字'),
				h('p', { className: 'dsh-thunder-intro' }, 'DSH 干活时，整帧砸下一记大白字。改动即时生效，保存在本机浏览器。'),
				row('启用', toggle({ value: cfg.enabled, patch: function (value) { return { enabled: value }; } })),
				row('用户发消息', toggle({ value: cfg.showStart, patch: function (value) { return { showStart: value }; } }), '弹「开始」'),
				row('智能体忙碌', toggle({ value: cfg.showBusy, patch: function (value) { return { showBusy: value }; } }), '弹「忙碌文案」'),
				row('工具调用', toggle({ value: cfg.showActions, patch: function (value) { return { showActions: value }; } }), '弹动作词'),
				row('大字', segmented(cfg.mode, [
					{ value: 'action', label: '跟随动作' },
					{ value: 'fixed', label: '固定词' }
				], function (value) { return { mode: value }; }), '跟随动作：bash→执行命令、read→查看文件'),
				cfg.mode === 'fixed'
					? row('固定词', h('input', {
						className: 'dsh-thunder-word-input',
						value: cfg.word,
						onChange: function (event) { store.update({ word: event.target.value }); }
					}))
					: null,
				row('忙碌文案', h('input', {
					className: 'dsh-thunder-word-input',
					value: cfg.busyWord,
					onChange: function (event) { store.update({ busyWord: event.target.value }); }
				}), '智能体开始干活时弹的字'),
				row('智能体完成', toggle({ value: cfg.showFinish, patch: function (value) { return { showFinish: value }; } }), '弹「完成文案」'),
				row('完成文案', h('input', {
					className: 'dsh-thunder-word-input',
					value: cfg.finishWord,
					onChange: function (event) { store.update({ finishWord: event.target.value }); }
				}), '智能体干完活时弹的字'),
				row('字号', slider(cfg.scale, 0.5, 1.6, 0.05, times, function (value) { return { scale: value }; })),
				row('停留', slider(cfg.duration, 200, 4000, 50, seconds, function (value) { return { duration: value }; }), '单帧白字保持多久'),
				row('间隔', slider(cfg.cooldown, 0, 3000, 50, millis, function (value) { return { cooldown: value }; }), '两次白字之间最短间隔'),
				row('背景', segmented(cfg.backdrop, [
					{ value: 'blur', label: '模糊' },
					{ value: 'solid', label: '纯色' },
					{ value: 'veil', label: '压暗' }
				], function (value) { return { backdrop: value }; })),
				cfg.backdrop === 'blur'
					? row('模糊半径', slider(cfg.backdropBlur, 0, 40, 1, pixels, function (value) { return { backdropBlur: value }; }))
					: null,
				cfg.backdrop === 'blur'
					? row('压暗', slider(cfg.backdropDim, 0, 0.8, 0.02, percent, function (value) { return { backdropDim: value }; }), '0 = 纯模糊，不压暗')
					: null,
				cfg.backdrop === 'solid'
					? row('底色', h('input', {
						className: 'dsh-thunder-color',
						type: 'color',
						value: cfg.backdropColor,
						onChange: function (event) { store.update({ backdropColor: event.target.value }); }
					}))
					: null,
				row('底部小字', toggle({ value: cfg.detail, patch: function (value) { return { detail: value }; } }), '工具名 + 参数预览'),
				row('远程字体', toggle({ value: cfg.remoteFont !== false, patch: function (value) { return { remoteFont: value }; } }), '从 GitHub 抓 Endfield；失败退回系统字体'),
				h('button', {
					className: 'dsh-thunder-test',
					onClick: function () {
						try { console.warn('[dsh-thunder-overlay] preview click, close =', typeof props.close); } catch (error) { /* ignore */ }
						if (typeof props.close === 'function') props.close();
						setTimeout(function () { store.triggerTest(); }, 360);
					}
				}, '预览一次'),
				h('button', {
					className: 'dsh-thunder-reset',
					onClick: function () { var patch = {}; for (var key in DEFAULTS) patch[key] = DEFAULTS[key]; store.update(patch); }
				}, '恢复默认')
			);
		}

		// ── 组件 ────────────────────────────────────────────────────────────
		function ThunderLayer(props) {
			var ctx = props.ctx;
			var store = props.store;
			useStore(store.subscribe, store.getVersion);
			var cfg = store.cfg;
			var uiSession = ctx.uiSession;

			var statusMap = useStatusMap(uiSession);
			var sessionId = useCurrentSessionKey(uiSession);
			var status = sessionId ? statusMap.get(sessionId) : undefined;
			var running = !!(status && status.running);

			var framePair = React.useState(null);
			var frame = framePair[0];
			var setFrame = framePair[1];

			var baselineRef = React.useRef(null);
			var shownSeqRef = React.useRef(-1);
			var shownAtRef = React.useRef(0);
			var hideTimerRef = React.useRef(0);

			// backdrop-filter 在某些 WebView 里对整个页面不生效，退一步：直接把应用内容的兄弟节点模糊掉。
			var blurTargets = React.useRef([]);
			var applyContentBlur = React.useCallback(function (on) {
				if (cfg.backdrop !== 'blur') return;
				if (!on) {
					for (var i = 0; i < blurTargets.current.length; i += 1) blurTargets.current[i].el.style.filter = blurTargets.current[i].prev;
					blurTargets.current = [];
					return;
				}
				if (blurTargets.current.length) return;
				var layer = document.querySelector('[data-shell-overlay]');
				var parent = layer && layer.parentElement;
				if (!parent) return;
				for (var j = 0; j < parent.children.length; j += 1) {
					var el = parent.children[j];
					if (el === layer) continue;
					blurTargets.current.push({ el: el, prev: el.style.filter });
					var viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 390;
					var blurFactor = Math.min(1.6, Math.max(0.8, viewportWidth / 390));
					el.style.filter = 'blur(' + Math.max(0, Math.round(cfg.backdropBlur * blurFactor)) + 'px)';
				}
			}, [cfg]);

			var lastPulseRef = React.useRef(0);
			var lastUserSeqRef = React.useRef(-1);

			var reveal = React.useCallback(function (work, durationMs) {
				shownAtRef.current = Date.now();
				var frameDuration = durationMs || cfg.duration;
				setFrame({ word: work.word, detail: work.detail, nonce: shownAtRef.current, duration: frameDuration });
			applyContentBlur(true);
				try { if (cfg.debug) console.warn("[dsh-thunder-overlay] frame", work.word, work.name || "(none)"); } catch (error) { /* ignore */ }
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = setTimeout(function () { setFrame(null); applyContentBlur(false); }, frameDuration + 60);
			}, [cfg.duration]);

			React.useEffect(function () {
				if (!running || !sessionId) {
					baselineRef.current = null;
					shownSeqRef.current = -1;
					return undefined;
				}
				if (baselineRef.current === null) {
					baselineRef.current = baselineSeq(bindingOf(ctx, sessionId));
					shownSeqRef.current = baselineRef.current;
					if (cfg.showBusy) {
						var busyWork = { word: cfg.busyWord || cfg.openingWord || '开始', detail: cfg.openingDetail || '' };
						var since = Date.now() - shownAtRef.current;
						// 留出一点时间让「开始」先露面；没有「开始」时也稍等，避免和它抢顺序。
						setTimeout(function () { reveal(busyWork); }, Math.max(360, 420 - since));
					}
				}
				var tick = function () {
					var work = readWork(ctx, sessionId, cfg, baselineRef.current);
					if (work.seq <= baselineRef.current) return;
					if (work.seq === shownSeqRef.current) return;
					shownSeqRef.current = work.seq;
					if (!cfg.showActions) return;
					if (Date.now() - shownAtRef.current < cfg.cooldown) return;
					reveal(work);
				};
				var interval = setInterval(tick, 120);
				return function () { clearInterval(interval); };
			}, [running, sessionId, cfg, ctx, reveal]);

			React.useEffect(function () {
				return function () { clearTimeout(hideTimerRef.current); applyContentBlur(false); };
			}, []);

			// 用户发消息 → 弹「开始」；只认当前会话里新出现的 user/message。
			React.useEffect(function () {
				if (!sessionId) return undefined;
				var current = function () {
					var w = windowOf(bindingOf(ctx, sessionId));
					var es = (w && w.entries) || [];
					var max = 0;
					for (var i = es.length - 1; i >= 0; i -= 1) {
						var e = es[i] && es[i].event;
						if (e && e.type === 'user/message' && typeof e.seq === 'number') { max = e.seq; break; }
					}
					return max;
				};
				lastUserSeqRef.current = current();
				var id = setInterval(function () {
					var next = current();
					if (next === 0 || next <= lastUserSeqRef.current) return;
					lastUserSeqRef.current = next;
					if (cfg.showStart) reveal({ word: cfg.openingWord || '开始', detail: '' });
				}, 140);
				return function () { clearInterval(id); };
			}, [sessionId, ctx, cfg, reveal]);

			var wasRunningRef = React.useRef(false);
			React.useEffect(function () {
				var was = wasRunningRef.current;
				wasRunningRef.current = running;
				if (was && !running && cfg.showFinish) {
					reveal({ word: cfg.finishWord || '完成', detail: '' });
				}
			}, [running, cfg, reveal]);

			React.useEffect(function () {
				if (store.pulse === lastPulseRef.current) return;
				lastPulseRef.current = store.pulse;
				reveal({
					word: cfg.mode === 'fixed' ? cfg.word : '执行命令',
					detail: 'TEST · 预览'
				}, Math.max(1600, cfg.duration));
			}, [store.pulse]);

			if (!cfg.enabled || !frame) return null;

			var style = {
				// inline 是为了压过 overlayLayer 的 `> * { pointer-events: auto }`，
				// 保证这层浮字永远不挡点击。
				pointerEvents: 'none',
				'--dsh-thunder-dur': (frame.duration || cfg.duration) + 'ms',
				'--dsh-thunder-veil': String(cfg.veil),
			};
			var glyphs = Math.max(1, Array.from(frame.word).length);
			// 按字数铺满约 84% 屏宽：两个字就是每字 42vw，随屏幕自适应。
			var veilStyle = cfg.backdrop === 'solid'
				? { background: hexToRgba(cfg.backdropColor, cfg.backdropAlpha) }
				: cfg.backdrop === 'blur'
					? {
						background: 'rgba(0,0,0,' + cfg.backdropDim + ')',
						backdropFilter: 'blur(' + cfg.backdropBlur + 'px)',
						WebkitBackdropFilter: 'blur(' + cfg.backdropBlur + 'px)'
					}
					: { background: 'radial-gradient(62% 58% at 50% 46%,rgba(9,11,16,' + (cfg.veil * 0.82) + '),rgba(3,4,7,' + cfg.veil + '))' };

			var wordStyle = { fontSize: 'min(calc(' + (84 * cfg.scale) + 'vw / ' + glyphs + '), ' + (60 * cfg.scale) + 'vh, ' + Math.round(520 * cfg.scale) + 'px)' };

			return h('div', { className: 'dsh-thunder', style: style, 'aria-hidden': 'true' },
				h('div', { className: 'dsh-thunder__veil', style: veilStyle }),
				h('div', { className: 'dsh-thunder__stage' },
					cfg.showBolt ? h('svg', {
						className: 'dsh-thunder__bolt',
						viewBox: '0 0 120 240',
						'aria-hidden': 'true'
					}, h('path', { d: 'M72 6 20 134h40L34 234l72-142H64z', fill: '#fff' })) : null,
					h('div', { className: 'dsh-thunder__copy' },
						h('div', {
							className: 'dsh-thunder__word',
							'data-text': frame.word,
							style: wordStyle,
							key: frame.nonce
						}, frame.word),
						cfg.detail && frame.detail
							? h('div', { className: 'dsh-thunder__detail', 'data-text': frame.detail }, frame.detail)
							: null
					)
				)
			);
		}

		// ── 插件 ────────────────────────────────────────────────────────────
		function apply(ctx, config) {
			var cfg = normalize(config);
			loadStored(cfg);
			debugLog = !!cfg.debug;
			var store = createStore(cfg);
			var disposeCss = injectCss(buildCss());
			try { if (cfg.remoteFont !== false) loadRemoteFont(); } catch (error) { /* 抓取失败就退回系统字体 */ }
			try { console.warn("[dsh-thunder-overlay] ready", { mode: cfg.mode, duration: cfg.duration }); } catch (error) { /* 无 console 的环境忽略 */ }
			var disposeSlot = ctx.slots.inject('shell.overlay', function () {
				return ctx.slots.register({
					name: 'shell.overlay',
					id: 'dsh-thunder-overlay',
					order: 820,
					label: '雷霆大白字'
				}, function () {
					return h(ThunderLayer, { ctx: ctx, store: store });
				});
			});
			var disposeSettings = ctx.slots.inject('settings.section', function () {
				return ctx.slots.register({
					name: 'settings.section',
					id: 'thunder-overlay',
					order: 18,
					label: '雷霆大白字'
				}, function () {
					return h(SettingsPage, { store: store });
				});
			});
			return function () {
				try { disposeSlot(); } finally { try { disposeSettings(); } finally { disposeCss(); } }
			};
		}

		var inject = ['slots', 'uiSession', 'sessions'];

		exports.apply = apply;
		exports.inject = inject;

		return module.exports;
	}
});
