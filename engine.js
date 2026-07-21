(() => {
  "use strict";

  const data = window.GAME_DATA;
  const AUTO_KEY = `${data.meta.id}:auto`;
  const SLOT_KEY = `${data.meta.id}:slots`;
  const PROFILE_KEY = `${data.meta.id}:profile`;
  const GUIDE_KEY = `${data.meta.id}:guide-seen`;

  const el = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));

  function createState() {
    return {
      version: data.meta.version,
      sceneId: data.meta.startScene,
      blockIndex: 0,
      stats: clone(data.initialState.stats),
      flags: clone(data.initialState.flags),
      memories: clone(data.initialState.memories),
      history: [],
      reachedScenes: [data.meta.startScene],
      ended: false,
      endingId: null,
      epilogueIndex: 0,
      settings: {
        typewriter: Boolean(data.meta.presentation?.typewriter),
        fontScale: 1,
        music: Boolean(data.meta.audio?.music?.enabled),
        sound: Boolean(data.meta.audio?.sfx?.enabled)
      }
    };
  }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  let state = loadJson(AUTO_KEY, null) || createState();
  if (state.version !== data.meta.version) {
    const previousSettings = state.settings || {};
    state = createState();
    state.settings.fontScale = previousSettings.fontScale || 1;
    state.settings.music = previousSettings.music ?? state.settings.music;
    state.settings.sound = previousSettings.sound ?? state.settings.sound;
  }
  let profile = loadJson(PROFILE_KEY, { unlockedEndings: [] });
  state.settings = { ...createState().settings, ...(state.settings || {}) };
  state.epilogueIndex = Number(state.epilogueIndex || 0);
  let typewriterTimer = null;
  window.GameAudio?.init(data.meta.audio || {}, state.settings);

  function saveAuto() {
    localStorage.setItem(AUTO_KEY, JSON.stringify(state));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function getPath(object, path) {
    return path.split(".").reduce((value, key) => value?.[key], object);
  }

  function matches(condition) {
    const actual = getPath(state, condition.path);
    if (condition.op === "eq") return actual === condition.value;
    if (condition.op === "gte") return Number(actual) >= Number(condition.value);
    if (condition.op === "lte") return Number(actual) <= Number(condition.value);
    if (condition.op === "sumGte") return Object.values(actual || {}).reduce((sum, value) => sum + Number(value), 0) >= Number(condition.value);
    if (condition.op === "minGte") return Object.values(actual || {}).every(value => Number(value) >= Number(condition.value));
    return false;
  }

  function resolveEnding() {
    return data.endings.find(ending => (ending.when.all || []).every(matches)) || data.endings.at(-1);
  }

  function clampStat(key, value) {
    const definition = data.statDefinitions[key];
    return Math.max(definition.min, value);
  }

  function applyEffects(effects = {}) {
    Object.entries(effects.stats || {}).forEach(([key, amount]) => {
      state.stats[key] = clampStat(key, Number(state.stats[key] || 0) + Number(amount));
    });
    Object.assign(state.flags, effects.flags || {});
    (effects.memories || []).forEach(id => {
      if (!state.memories.includes(id)) state.memories.push(id);
    });
  }

  function addHistory(scene, choice, reaction) {
    state.history.push({
      scene: scene.title,
      choice,
      reaction,
      time: new Date().toLocaleString("zh-CN")
    });
  }

  function goTo(target) {
    if (target === "@ending") {
      const ending = resolveEnding();
      state.ended = true;
      state.endingId = ending.id;
      state.epilogueIndex = 0;
      if (!profile.unlockedEndings.includes(ending.id)) profile.unlockedEndings.push(ending.id);
    } else {
      state.sceneId = target;
      state.blockIndex = 0;
      if (!state.reachedScenes.includes(target)) state.reachedScenes.push(target);
    }
    saveAuto();
    render();
  }

  function renderStats() {
    const statsHtml = data.meta.visibleStats.map(key => {
      const definition = data.statDefinitions[key];
      const value = state.stats[key];
      const percent = Math.min(100, value / definition.max * 100);
      return `<div class="stat-row"><div><span>${definition.label}</span><b>${value}</b></div><div class="meter"><i style="width:${percent}%"></i></div></div>`;
    }).join("");
    el("stats").innerHTML = statsHtml;
    el("mobileStats").innerHTML = statsHtml;

    const unlockedMemories = state.memories.map(id =>
      `<button class="memory-chip" title="${data.memoryDefinitions[id].description}">${data.memoryDefinitions[id].title}</button>`
    );
    const lockedHiddenMemories = Object.entries(data.memoryDefinitions)
      .filter(([id, definition]) => definition.hidden && !state.memories.includes(id))
      .map(([, definition]) =>
        `<button class="memory-chip" disabled title="${definition.lockedHint || "故事里还有特殊纪念物等待发现。"}">◇ 尚未发现的特殊纪念物</button>`
      );
    const memoryItems = [...unlockedMemories, ...lockedHiddenMemories];
    el("memories").innerHTML = memoryItems.length
      ? memoryItems.join("")
      : `<p class="muted">故事中的重要时刻会保存在这里。</p>`;

    renderAchievements();
  }

  function renderAchievements() {
    const unlocked = new Set(profile.unlockedEndings);
    const revealLastEnding = unlocked.size === data.endings.length - 1;
    const visibleEndings = data.endings.filter(ending => unlocked.has(ending.id));
    const lastLockedEnding = revealLastEnding
      ? data.endings.find(ending => !unlocked.has(ending.id))
      : null;
    el("endingAchievements").innerHTML = `
      <button class="achievement-summary" data-open-endings>
        <span>已解锁</span><b>${unlocked.size}/${data.endings.length}</b>
      </button>
      ${visibleEndings.length ? visibleEndings.map(ending => `
        <div class="achievement is-unlocked">
          <span>◆</span>
          <div><b>${ending.title}</b><small>${ending.subtitle}</small></div>
        </div>`).join("") : `<p class="achievement-empty">达成结局后，对应成就会在这里出现。</p>`}
      ${lastLockedEnding ? `
        <div class="achievement is-locked">
          <span>◇</span>
          <div><b>${lastLockedEnding.title}</b><small>最后一个结局尚未解锁</small></div>
        </div>` : ""}`;
    el("endingAchievements").querySelector("[data-open-endings]").onclick = () => {
      renderEndings();
      el("endingModal").showModal();
    };
  }

  function blockHtml(block) {
    if (block.type === "dialogue") return `<div class="block dialogue"><b>${block.speaker}</b><p>${block.text}</p></div>`;
    if (block.type === "thought") return `<div class="block thought"><p>${block.text}</p></div>`;
    if (block.type === "system") return `<div class="block system"><p>${block.text}</p></div>`;
    return `<div class="block narration"><p>${block.text}</p></div>`;
  }

  function applyTypewriter() {
    if (typewriterTimer) window.clearInterval(typewriterTimer);
    typewriterTimer = null;
    if (!state.settings.typewriter) return;
    const target = el("storyContent").querySelector(".block:last-child p");
    if (!target) return;
    const text = target.textContent;
    target.textContent = "";
    let index = 0;
    typewriterTimer = window.setInterval(() => {
      target.textContent += text[index] || "";
      index += 1;
      if (index >= text.length) {
        window.clearInterval(typewriterTimer);
        typewriterTimer = null;
      }
    }, 24);
  }

  function renderScene() {
    const scene = data.scenes[state.sceneId];
    window.GameAudio?.setScene(state.sceneId);
    el("chapterLabel").textContent = scene.chapter;
    el("sceneProgress").textContent = `${state.reachedScenes.length} 个场景已体验`;
    const visibleBlocks = scene.blocks.filter(block => !block.when || (block.when.all || []).every(matches));
    el("storyContent").innerHTML = `<h2>${scene.title}</h2>${visibleBlocks.map(blockHtml).join("")}`;
    applyTypewriter();

    const visibleChoices = scene.choices.filter(choice => !choice.when || (choice.when.all || []).every(matches));
    el("controls").innerHTML = `<div class="choices">${visibleChoices.map((choice, index) => `<button data-choice="${index}" class="${choice.special ? "special-choice" : ""}">${choice.text}</button>`).join("")}</div>`;
    el("controls").querySelectorAll("[data-choice]").forEach(button => {
      button.onclick = () => {
        const choice = visibleChoices[Number(button.dataset.choice)];
        applyEffects(choice.effects);
        addHistory(scene, choice.text, choice.reaction);
        el("controls").innerHTML = `<div class="reaction"><p>${choice.reaction}</p><button class="primary">继续</button></div>`;
        renderStats();
        el("controls").querySelector("button").onclick = () => goTo(choice.next);
      };
    });
  }

  function renderEnding() {
    const ending = data.endings.find(item => item.id === state.endingId) || resolveEnding();
    window.GameAudio?.setScene("@ending");
    el("chapterLabel").textContent = "故事结束";
    el("sceneProgress").textContent = `${profile.unlockedEndings.length}/${data.endings.length} 个结局已解锁`;
    const epilogue = (ending.epilogue || []).filter(block =>
      !block.when || (block.when.all || []).every(matches)
    );
    if (state.epilogueIndex < epilogue.length) {
      const visibleBlocks = epilogue.slice(0, state.epilogueIndex + 1);
      el("chapterLabel").textContent = ending.epilogueLabel || "后日篇";
      el("storyContent").innerHTML = `<h2>${ending.epilogueTitle || "后来"}</h2>${visibleBlocks.map(blockHtml).join("")}`;
      applyTypewriter();
      el("controls").innerHTML = `<button class="continue primary">继续</button>`;
      el("controls").querySelector("button").onclick = () => {
        state.epilogueIndex += 1;
        saveAuto();
        renderEnding();
      };
      return;
    }
    const conditionNames = {
      "flags.romanceChosen":"明确选择了与锚发展恋爱",
      "flags.friendshipChosen":"明确选择了珍视这段友情",
      "flags.notebookPermissionKept":"守住或修复了锚的私人笔记边界",
      "flags.notebookBreached":"越过了锚的私人笔记边界",
      "flags.boundaryRepaired":"在越界后完成了诚实修复",
      "flags.privateAudioJointlyAuthorized":"由两人共同决定了测试录音的用途",
      "flags.anchorStatedWant":"锚主动说出了一次具体愿望",
      "flags.kokoLeftResponseSpace":"可可在直球后留下了拒绝或延期的空间",
      "flags.publicBoundaryKept":"在公开场合守住了双方授权边界"
    };
    const describeCondition = condition => {
      if (condition.op === "sumGte") return `三项状态总分达到 ${condition.value}（当前 ${Object.values(state.stats).reduce((a,b)=>a+Number(b),0)}）`;
      if (condition.op === "minGte") return `三项状态均不低于 ${condition.value}（当前：${data.meta.visibleStats.map(key=>`${data.statDefinitions[key].label} ${state.stats[key]}`).join("、")}）`;
      if (condition.path.startsWith("stats.")) return `${data.statDefinitions[condition.path.split(".")[1]]?.label || condition.path}达到 ${condition.value}（当前 ${getPath(state,condition.path)}）`;
      const base = conditionNames[condition.path] || condition.path;
      return condition.op === "eq" && condition.value === false ? `没有${base.replace(/^没有/,"")}` : base;
    };
    const checks = (ending.when.all || []).map(condition => ({label:describeCondition(condition),met:matches(condition)}));
    el("storyContent").innerHTML = `
      <div class="ending-card">
        <p class="eyebrow">${ending.subtitle}</p>
        <h2>${ending.title}</h2>
        <p>${ending.text}</p>
        <div class="ending-reason"><b>这次故事为什么走到这里</b><p>${ending.hint}</p><div class="ending-checks">${checks.map(item=>`<p class="${item.met ? "met" : "missed"}">${item.met ? "✓ 已达成" : "○ 未达成"}：${item.label}</p>`).join("")}</div></div>
      </div>`;
    el("controls").innerHTML = `<button class="primary" data-restart-ending>重新开始，尝试其他选择</button>`;
    el("controls").querySelector("button").onclick = restart;
  }

  function render() {
    el("gameTitle").textContent = data.meta.title;
    document.documentElement.style.setProperty("--font-scale", state.settings.fontScale);
    document.querySelector('[data-action="typewriter"]').textContent = `打字机：${state.settings.typewriter ? "开" : "关"}`;
    document.querySelector('[data-action="music"]').textContent = `音乐：${state.settings.music ? "开" : "关"}`;
    document.querySelector('[data-action="sound"]').textContent = `音效：${state.settings.sound ? "开" : "关"}`;
    renderStats();
    state.ended ? renderEnding() : renderScene();
  }

  function restart() {
    if (!confirm("确定重新开始吗？手动存档不会被删除。")) return;
    const settings = state.settings;
    state = createState();
    state.settings = settings;
    saveAuto();
    render();
  }

  function renderHistory() {
    el("historyList").innerHTML = state.history.length
      ? state.history.map(item => `<article class="history-item"><b>${item.scene}</b><p>选择：${item.choice}</p><p>${item.reaction}</p></article>`).join("")
      : `<p class="muted">还没有做出选择。</p>`;
  }

  function renderSaveSlots() {
    const slots = loadJson(SLOT_KEY, [null, null, null]);
    el("saveSlots").innerHTML = slots.map((slot, index) => `
      <article class="save-slot">
        <div><b>存档 ${index + 1}</b><p>${slot ? `${slot.label} · ${slot.savedAt}` : "空存档"}</p></div>
        <div><button data-save="${index}">保存</button><button data-load="${index}" ${slot ? "" : "disabled"}>读取</button></div>
      </article>`).join("");
    el("saveSlots").querySelectorAll("[data-save]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.save);
      slots[index] = { savedAt: new Date().toLocaleString("zh-CN"), label: state.ended ? "结局" : data.scenes[state.sceneId].title, state: clone(state) };
      localStorage.setItem(SLOT_KEY, JSON.stringify(slots));
      renderSaveSlots();
    });
    el("saveSlots").querySelectorAll("[data-load]").forEach(button => button.onclick = () => {
      const slot = slots[Number(button.dataset.load)];
      if (!slot) return;
      state = clone(slot.state);
      saveAuto();
      button.closest("dialog").close();
      render();
    });
  }

  function renderEndings() {
    const unlockedCount = profile.unlockedEndings.length;
    const revealLastEnding = unlockedCount === data.endings.length - 1;
    const visibleEndings = data.endings.filter(ending => profile.unlockedEndings.includes(ending.id));
    const lastLockedEnding = revealLastEnding
      ? data.endings.find(ending => !profile.unlockedEndings.includes(ending.id))
      : null;
    const endingCards = visibleEndings.map(ending => {
      const unlocked = profile.unlockedEndings.includes(ending.id);
      return `<article class="ending-list-item ${unlocked ? "unlocked" : "locked"}">
        <b>${unlocked ? "◆" : "◇"} ${ending.title}</b>
        <p>${unlocked ? `${ending.subtitle} · ${ending.hint}` : `尚未解锁 · 提示：${ending.lockedHint}`}</p>
      </article>`;
    });
    if (lastLockedEnding) {
      endingCards.push(`<article class="ending-list-item locked">
        <b>◇ ${lastLockedEnding.title}</b>
        <p>最后一个结局尚未解锁 · 提示：${lastLockedEnding.lockedHint}</p>
      </article>`);
    }
    el("endingList").innerHTML = endingCards.length
      ? endingCards.join("")
      : `<p class="achievement-empty">目前还没有解锁结局。完成一次故事后，成就会在这里出现。</p>`;
  }

  document.querySelectorAll("[data-modal]").forEach(button => button.onclick = () => {
    if (button.dataset.modal === "historyModal") renderHistory();
    if (button.dataset.modal === "saveModal") renderSaveSlots();
    if (button.dataset.modal === "endingModal") renderEndings();
    el(button.dataset.modal).showModal();
  });
  document.querySelectorAll("[data-close]").forEach(button => button.onclick = () => button.closest("dialog").close());
  document.querySelector("[data-guide-start]").onclick = () => {
    localStorage.setItem(GUIDE_KEY, "1");
    el("guideModal").close();
  };
  document.querySelector('[data-action="restart"]').onclick = restart;
  document.querySelector('[data-action="fullscreen"]').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  document.querySelector('[data-action="typewriter"]').onclick = () => { state.settings.typewriter = !state.settings.typewriter; saveAuto(); render(); };
  document.querySelector('[data-action="music"]').onclick = () => {
    state.settings.music = !state.settings.music;
    window.GameAudio?.setMusic(state.settings.music);
    saveAuto();
    render();
  };
  document.querySelector('[data-action="sound"]').onclick = () => {
    state.settings.sound = !state.settings.sound;
    window.GameAudio?.setSound(state.settings.sound);
    saveAuto();
    render();
  };
  document.querySelector('[data-action="font"]').onclick = () => {
    const options = [0.9, 1, 1.12, 1.25];
    state.settings.fontScale = options[(options.indexOf(state.settings.fontScale) + 1) % options.length];
    saveAuto();
    render();
  };

  document.addEventListener("click", () => {
    window.GameAudio?.unlock();
    window.GameAudio?.click();
  }, { capture: true });

  render();
  if (!localStorage.getItem(GUIDE_KEY)) el("guideModal").showModal();
})();
