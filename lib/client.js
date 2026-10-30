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
			word: '开始',             // mode=fixed 时的大字；也是开场/无动作时的字
			openingWord: '开始',      // 用户发消息时弹的字
			busyWord: '雷霆',         // 智能体进入忙碌状态时弹的字（设置页可改）
			finishWord: '完成',       // 智能体干完活时弹的字（设置页可改）
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
