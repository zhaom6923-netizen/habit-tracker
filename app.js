(function () {
  'use strict';

  const STORAGE_KEY = 'habit-tracker:v1';
  const STORAGE_VERSION = 1;
  const MAX_NAME_LENGTH = 30;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const elements = {
    todayDate: document.getElementById('todayDate'),
    shareButton: document.getElementById('shareButton'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),
    progressBar: document.getElementById('progressBar'),
    progressMessage: document.getElementById('progressMessage'),
    sectionHint: document.getElementById('sectionHint'),
    remainingBadge: document.getElementById('remainingBadge'),
    addHabitForm: document.getElementById('addHabitForm'),
    habitInput: document.getElementById('habitInput'),
    addHabitError: document.getElementById('addHabitError'),
    habitList: document.getElementById('habitList'),
    emptyState: document.getElementById('emptyState'),
    emptyAddButton: document.getElementById('emptyAddButton'),
    allDone: document.getElementById('allDone'),
    editDialog: document.getElementById('editDialog'),
    editForm: document.getElementById('editForm'),
    editHabitInput: document.getElementById('editHabitInput'),
    editHabitError: document.getElementById('editHabitError'),
    closeEditButton: document.getElementById('closeEditButton'),
    cancelEditButton: document.getElementById('cancelEditButton'),
    deleteDialog: document.getElementById('deleteDialog'),
    deleteForm: document.getElementById('deleteForm'),
    deleteDialogText: document.getElementById('deleteDialogText'),
    cancelDeleteButton: document.getElementById('cancelDeleteButton'),
    toast: document.getElementById('toast')
  };

  let state = loadState();
  let currentDateKey = getDateKey();
  let editingHabitId = null;
  let pendingDeleteId = null;
  let toastTimer = null;
  let midnightTimer = null;

  function createEmptyState() {
    return {
      version: STORAGE_VERSION,
      habits: [],
      completionByDate: {}
    };
  }

  function normalizeName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyState();

      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        parsed.version !== STORAGE_VERSION ||
        !Array.isArray(parsed.habits) ||
        !parsed.completionByDate ||
        typeof parsed.completionByDate !== 'object'
      ) {
        return createEmptyState();
      }

      const habits = [];
      const habitIds = new Set();
      const habitNames = new Set();

      parsed.habits.forEach((candidate) => {
        if (!candidate || typeof candidate !== 'object') return;

        const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
        const name = normalizeName(candidate.name);
        const nameKey = name.toLocaleLowerCase('zh-CN');
        const createdAt = Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();

        if (
          !id ||
          habitIds.has(id) ||
          !name ||
          name.length > MAX_NAME_LENGTH ||
          habitNames.has(nameKey)
        ) {
          return;
        }

        habitIds.add(id);
        habitNames.add(nameKey);
        habits.push({ id, name, createdAt });
      });

      const completionByDate = {};
      Object.entries(parsed.completionByDate).forEach(([dateKey, completedIds]) => {
        if (!DATE_PATTERN.test(dateKey) || !Array.isArray(completedIds)) return;

        const validIds = [...new Set(completedIds)].filter(
          (id) => typeof id === 'string' && habitIds.has(id)
        );

        if (validIds.length > 0) {
          completionByDate[dateKey] = validIds;
        }
      });

      return {
        version: STORAGE_VERSION,
        habits,
        completionByDate
      };
    } catch (error) {
      return createEmptyState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      showToast('浏览器暂时无法保存，请检查隐私设置。');
      return false;
    }
  }

  function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getTodayCompletions() {
    const completedIds = state.completionByDate[currentDateKey];
    return Array.isArray(completedIds) ? completedIds : [];
  }

  function createHabitId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return `habit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function findHabit(id) {
    return state.habits.find((habit) => habit.id === id);
  }

  function isDuplicateName(name, excludedId = null) {
    const normalized = normalizeName(name).toLocaleLowerCase('zh-CN');
    return state.habits.some(
      (habit) => habit.id !== excludedId && habit.name.toLocaleLowerCase('zh-CN') === normalized
    );
  }

  function validateHabitName(value, excludedId = null) {
    const name = normalizeName(value);

    if (!name) return { name, error: '请输入习惯名称。' };
    if (name.length > MAX_NAME_LENGTH) {
      return { name, error: `习惯名称不能超过 ${MAX_NAME_LENGTH} 个字符。` };
    }
    if (isDuplicateName(name, excludedId)) {
      return { name, error: '已经有同名习惯了，换一个名字试试。' };
    }

    return { name, error: '' };
  }
  function renderDate() {
    elements.todayDate.dateTime = currentDateKey;
    elements.todayDate.textContent = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  }

  function createIconButton(action, label, iconPath) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-button${action === 'delete' ? ' icon-button--danger' : ''}`;
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPath}</svg>`;
    return button;
  }

  function createHabitElement(habit, completed) {
    const item = document.createElement('div');
    item.className = `habit-item${completed ? ' is-completed' : ''}`;
    item.dataset.id = habit.id;
    item.setAttribute('role', 'listitem');

    const checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'check-button';
    checkButton.dataset.action = 'toggle';
    checkButton.setAttribute('aria-pressed', String(completed));
    checkButton.setAttribute('aria-label', `${completed ? '取消完成' : '完成'}：${habit.name}`);
    checkButton.title = completed ? '取消完成' : '标记完成';
    checkButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6.5 12.5 3.5 3.5 7.5-8"></path></svg>';

    const copy = document.createElement('div');
    copy.className = 'habit-copy';

    const name = document.createElement('span');
    name.className = 'habit-name';
    name.textContent = habit.name;

    const status = document.createElement('span');
    status.className = 'habit-status';
    status.textContent = completed ? '今天已完成' : '等待完成';

    copy.append(name, status);

    const actions = document.createElement('div');
    actions.className = 'habit-actions';
    actions.append(
      createIconButton(
        'edit',
        `编辑习惯：${habit.name}`,
        '<path d="M13.5 6.5 17.5 10.5M4 20l4.8-1 10.7-10.7a1.8 1.8 0 0 0 0-2.6l-1.2-1.2a1.8 1.8 0 0 0-2.6 0L5 15.2 4 20Z"></path>'
      ),
      createIconButton(
        'delete',
        `删除习惯：${habit.name}`,
        '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>'
      )
    );

    item.append(checkButton, copy, actions);
    return item;
  }

  function render() {
    const completedIds = new Set(getTodayCompletions());
    const total = state.habits.length;
    const completed = state.habits.filter((habit) => completedIds.has(habit.id)).length;
    const remaining = Math.max(total - completed, 0);
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    elements.progressText.textContent = `已完成 ${completed} / 共 ${total} 项`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressBar.style.width = `${percent}%`;
    elements.remainingBadge.textContent = remaining === 0 && total > 0
      ? '今日已完成'
      : `${remaining} 项待完成`;

    if (total === 0) {
      elements.progressMessage.textContent = '添加一个小习惯，从今天开始。';
      elements.sectionHint.textContent = '每天结束前，回来看看今天完成了多少。';
    } else if (remaining === 0) {
      elements.progressMessage.textContent = '今天的清单已全部点亮。';
      elements.sectionHint.textContent = `今天完成了 ${completed} 项，做得很好。`;
    } else if (completed === 0) {
      elements.progressMessage.textContent = `今天有 ${total} 项小目标，慢慢来。`;
      elements.sectionHint.textContent = '从最容易的一项开始，完成后点一下。';
    } else {
      elements.progressMessage.textContent = `再完成 ${remaining} 项，今天就更完整了。`;
      elements.sectionHint.textContent = `今天已完成 ${completed} 项，继续保持。`;
    }

    elements.habitList.replaceChildren();
    state.habits.forEach((habit) => {
      elements.habitList.append(createHabitElement(habit, completedIds.has(habit.id)));
    });

    elements.emptyState.hidden = total > 0;
    elements.allDone.hidden = total === 0 || remaining > 0;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');

    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove('is-visible');
    }, 2600);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function findHabitElement(id) {
    return [...elements.habitList.children].find((element) => element.dataset.id === id);
  }
  function addHabit(event) {
    event.preventDefault();
    const result = validateHabitName(elements.habitInput.value);

    if (result.error) {
      elements.addHabitError.textContent = result.error;
      elements.habitInput.setAttribute('aria-invalid', 'true');
      elements.habitInput.focus();
      return;
    }

    state.habits.push({
      id: createHabitId(),
      name: result.name,
      createdAt: Date.now()
    });

    const saved = saveState();
    elements.habitInput.value = '';
    elements.addHabitError.textContent = '';
    elements.habitInput.removeAttribute('aria-invalid');
    render();
    elements.habitInput.focus();

    if (saved) showToast(`已添加「${result.name}」`);
  }

  function toggleHabit(id) {
    const habit = findHabit(id);
    if (!habit) return;

    const completedIds = new Set(getTodayCompletions());

    if (completedIds.has(id)) {
      completedIds.delete(id);
    } else {
      completedIds.add(id);
    }

    if (completedIds.size > 0) {
      state.completionByDate[currentDateKey] = [...completedIds];
    } else {
      delete state.completionByDate[currentDateKey];
    }

    saveState();
    render();

    const updatedElement = findHabitElement(id);
    const checkButton = updatedElement && updatedElement.querySelector('[data-action="toggle"]');
    if (checkButton) checkButton.focus();
  }

  function openEditDialog(id) {
    const habit = findHabit(id);
    if (!habit) return;

    editingHabitId = id;
    elements.editHabitInput.value = habit.name;
    elements.editHabitError.textContent = '';
    elements.editHabitInput.removeAttribute('aria-invalid');
    openDialog(elements.editDialog);

    window.requestAnimationFrame(() => {
      elements.editHabitInput.focus();
      elements.editHabitInput.select();
    });
  }

  function editHabit(event) {
    event.preventDefault();

    const habit = findHabit(editingHabitId);
    if (!habit) {
      closeDialog(elements.editDialog);
      return;
    }

    const result = validateHabitName(elements.editHabitInput.value, habit.id);
    if (result.error) {
      elements.editHabitError.textContent = result.error;
      elements.editHabitInput.setAttribute('aria-invalid', 'true');
      elements.editHabitInput.focus();
      return;
    }

    const previousName = habit.name;
    habit.name = result.name;
    const saved = saveState();
    const habitId = habit.id;
    closeDialog(elements.editDialog);
    render();

    const updatedElement = findHabitElement(habitId);
    const editButton = updatedElement && updatedElement.querySelector('[data-action="edit"]');
    if (editButton) editButton.focus();

    if (saved && previousName !== result.name) {
      showToast(`已重命名为「${result.name}」`);
    }
  }

  function openDeleteDialog(id) {
    const habit = findHabit(id);
    if (!habit) return;

    pendingDeleteId = id;
    elements.deleteDialogText.textContent = `删除「${habit.name}」后，它每天的打卡记录也会一起移除。`;
    openDialog(elements.deleteDialog);
  }

  function deleteHabit(event) {
    event.preventDefault();

    const habit = findHabit(pendingDeleteId);
    if (!habit) {
      closeDialog(elements.deleteDialog);
      return;
    }

    const habitName = habit.name;
    state.habits = state.habits.filter((item) => item.id !== habit.id);

    Object.keys(state.completionByDate).forEach((dateKey) => {
      const remainingIds = state.completionByDate[dateKey].filter((id) => id !== habit.id);

      if (remainingIds.length > 0) {
        state.completionByDate[dateKey] = remainingIds;
      } else {
        delete state.completionByDate[dateKey];
      }
    });

    const saved = saveState();
    closeDialog(elements.deleteDialog);
    render();
    elements.habitInput.focus();

    if (saved) showToast(`已删除「${habitName}」`);
  }

  async function shareApp() {
    const shareData = {
      title: document.title,
      text: '一个简洁的习惯打卡应用',
      url: window.location.href
    };

    if (window.location.protocol !== 'file:' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && window.location.protocol !== 'file:') {
        await navigator.clipboard.writeText(shareData.url);
        showToast('链接已复制，可以分享给朋友了。');
        return;
      }
    } catch (error) {
      // Fall through to the older copy method.
    }

    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = shareData.url;
    temporaryInput.setAttribute('readonly', '');
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.opacity = '0';
    document.body.append(temporaryInput);
    temporaryInput.select();

    if (document.execCommand('copy')) {
      showToast(window.location.protocol === 'file:' ? '本地地址已复制，发布后可分享公开链接。' : '链接已复制，可以分享给朋友了。');
    } else {
      window.prompt('复制下面的链接分享给朋友：', shareData.url);
    }

    temporaryInput.remove();
  }
  function bindEvents() {
    elements.shareButton.addEventListener('click', shareApp);
    elements.addHabitForm.addEventListener('submit', addHabit);
    elements.habitInput.addEventListener('input', () => {
      elements.addHabitError.textContent = '';
      elements.habitInput.removeAttribute('aria-invalid');
    });

    elements.emptyAddButton.addEventListener('click', () => elements.habitInput.focus());

    elements.habitList.addEventListener('click', (event) => {
      const actionButton = event.target.closest('button[data-action]');
      if (!actionButton) return;

      const habitElement = actionButton.closest('.habit-item');
      if (!habitElement) return;

      const { id } = habitElement.dataset;
      const { action } = actionButton.dataset;

      if (action === 'toggle') toggleHabit(id);
      if (action === 'edit') openEditDialog(id);
      if (action === 'delete') openDeleteDialog(id);
    });

    elements.editForm.addEventListener('submit', editHabit);
    elements.editHabitInput.addEventListener('input', () => {
      elements.editHabitError.textContent = '';
      elements.editHabitInput.removeAttribute('aria-invalid');
    });
    elements.closeEditButton.addEventListener('click', () => closeDialog(elements.editDialog));
    elements.cancelEditButton.addEventListener('click', () => closeDialog(elements.editDialog));
    elements.editDialog.addEventListener('close', () => {
      editingHabitId = null;
      elements.editHabitError.textContent = '';
      elements.editHabitInput.removeAttribute('aria-invalid');
    });

    elements.deleteForm.addEventListener('submit', deleteHabit);
    elements.cancelDeleteButton.addEventListener('click', () => closeDialog(elements.deleteDialog));
    elements.deleteDialog.addEventListener('close', () => {
      pendingDeleteId = null;
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncDate();
    });
    window.addEventListener('focus', syncDate);
    window.addEventListener('pageshow', syncDate);
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      currentDateKey = getDateKey();
      renderDate();
      render();
    });
  }

  function syncDate() {
    const nextDateKey = getDateKey();
    renderDate();

    if (nextDateKey === currentDateKey) return;

    currentDateKey = nextDateKey;
    render();
    showToast('新的一天，继续加油。');
  }

  function scheduleMidnightRefresh() {
    window.clearTimeout(midnightTimer);

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 300);
    const delay = Math.max(1000, Math.min(nextMidnight.getTime() - now.getTime(), 60 * 60 * 1000));

    midnightTimer = window.setTimeout(() => {
      syncDate();
      scheduleMidnightRefresh();
    }, delay);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }, { once: true });
  }

  registerServiceWorker();
  bindEvents();
  renderDate();
  render();
  scheduleMidnightRefresh();
})();