// ------------------------------
// Configuration Supabase
// ------------------------------
const supabaseUrl = "https://qnqkizhwtwsptqnayfpd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucWtpemh3dHdzcHRxbmF5ZnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4NTE3ODYsImV4cCI6MjA1MjQyNzc4Nn0.oP5hXVIo1bAGLCYcqEOIEpyFZNhaQ43eNsvU9i_Qq6Q";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Variable globale pour stocker l'id de l'utilisateur connecté
let currentUserId = null;

// Vérification de l'authentification
async function checkAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return false;
  }
  // Stocke l'id de l'utilisateur connecté dans la variable globale
  currentUserId = user.id;
  return user;
}

// Gestionnaire de déconnexion
async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Error logging out:', error);
    showToast('Error logging out', 'error');
  }
}

// Initialize authentication UI
async function initializeAuth() {
  const user = await checkAuth();
  if (!user) return;

  const userEmail = document.getElementById('userEmail');
  const profileButton = document.getElementById('profileButton');
  const profileMenu = document.getElementById('profileMenu');
  const logoutButton = document.getElementById('logoutButton');

  if (userEmail) userEmail.textContent = user.email;

  profileButton?.addEventListener('click', () => {
    profileMenu?.classList.toggle('active');
  });

  logoutButton?.addEventListener('click', handleLogout);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-dropdown')) {
      profileMenu?.classList.remove('active');
    }
  });
}

// ------------------------------
// Variables globales d'état
// ------------------------------
let links = [];
let folders = [];
let notebooks = [];
let currentNotebookId = null;
let currentNoteId = null;
let showFavorites = false;
let currentFolder = null;
let isEditing = false;
let editingIndex = null;
let undoStack = [];
let showDates = localStorage.getItem('showDates') !== 'false'; // true par défaut
let showQrButton = localStorage.getItem('showQrButton') === 'true';
let showPreviewButton = localStorage.getItem('showPreviewButton') === 'true';
let currentDomainFilter = null;

// ------------------------------
// Fonctions utilitaires communes
// ------------------------------

// Affichage de notifications (toasts)
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  const icon = toast.querySelector(".toast-icon");
  const messageEl = toast.querySelector(".toast-message");
  if (icon) {
    icon.className = `toast-icon fas ${type === "success" ? "fa-check" : "fa-exclamation-triangle"}`;
  }
  if (messageEl) {
    messageEl.textContent = message;
  }
  toast.style.transition = "all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
  toast.classList.add("visible");
  setTimeout(() => {
    toast.style.transition = "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
    toast.classList.remove("visible");
  }, 3000);
}

// Gestion centralisée des erreurs
async function handleError(error, operation) {
  console.error(`Error during ${operation}:`, error);
  showToast(`Error during ${operation}`, "error");
  throw error;
}

// Fonction debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Génération d’un ID unique
function generateId() {
  return "_" + Math.random().toString(36).substr(2, 9);
}

// Pour les domaines internationalisés, on utilisera l'API intégrée punycode si disponible
const punycode = typeof window === 'undefined' ? require('punycode') : window.punycode;

// Cache pour les URL déjà normalisées ou traitées
const urlCache = new Map();
const titleCache = new Map();

/**
 * Normalise une URL en ajoutant un protocole par défaut, en supprimant le préfixe "www.",
 * en nettoyant le chemin, en supprimant les ports par défaut, et en convertissant
 * le nom de domaine en punycode si nécessaire.
 */
function normalizeUrl(inputUrl, baseUrl = '') {
  const cacheKey = baseUrl + inputUrl;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey);
  }
  let url = inputUrl.trim();
  try {
    let urlObj;
    if (baseUrl) {
      urlObj = new URL(url, baseUrl);
    } else {
      if (url.startsWith('//')) {
        url = `https:${url}`;
      } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
        url = `https://${url}`;
      }
      urlObj = new URL(url);
    }
    urlObj.protocol = urlObj.protocol.toLowerCase();
    if ((urlObj.protocol === 'https:' && urlObj.port === '443') ||
      (urlObj.protocol === 'http:' && urlObj.port === '80')) {
      urlObj.port = '';
    }
    let hostname = urlObj.hostname.toLowerCase();
    if (typeof punycode !== 'undefined' && punycode.toASCII) {
      hostname = punycode.toASCII(hostname);
    }
    hostname = hostname.replace(/^www\./, '');
    urlObj.hostname = hostname;
    let pathname = urlObj.pathname.replace(/\/{2,}/g, '/');
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }
    urlObj.pathname = pathname;
    const searchParams = urlObj.searchParams;
    const filteredParams = new URLSearchParams();
    const blacklist = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    [...searchParams.entries()].forEach(([key, value]) => {
      if (!blacklist.includes(key.toLowerCase())) {
        filteredParams.append(key, value);
      }
    });
    urlObj.search = filteredParams.toString() ? `?${filteredParams.toString()}` : '';
    const normalized = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    urlCache.set(cacheKey, normalized);
    return normalized;
  } catch (e) {
    if (!url.startsWith('https://')) {
      const result = normalizeUrl(`https://${url}`, baseUrl);
      urlCache.set(cacheKey, result);
      return result;
    }
    urlCache.set(cacheKey, url);
    return url;
  }
}

/**
 * Extrait et formate un titre à partir d'une URL
 */
function extractTitleFromUrl(url) {
  if (titleCache.has(url)) {
    return titleCache.get(url);
  }
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    const titleParams = ['title', 'name', 't', 'heading', 'q'];
    for (const param of titleParams) {
      const value = params.get(param);
      if (value) {
        const title = formatTitle(decodeURIComponent(value));
        titleCache.set(url, title);
        return title;
      }
    }
    const segments = urlObj.pathname.split('/').filter(Boolean);
    if (segments.length) {
      let candidate = segments[segments.length - 1];
      candidate = candidate.replace(/\.(html?|php|asp|aspx|jsp)$/i, '');
      candidate = candidate.replace(/[-_]+/g, ' ');
      if (candidate && candidate.length > 1) {
        const title = formatTitle(candidate);
        titleCache.set(url, title);
        return title;
      }
    }
    if (segments.length) {
      const candidate = segments.join(' ').replace(/[-_]+/g, ' ');
      if (candidate && candidate.length > 1) {
        const title = formatTitle(candidate);
        titleCache.set(url, title);
        return title;
      }
    }
    let domain = urlObj.hostname.replace(/^www\./, '');
    const domainParts = domain.split('.');
    if (domainParts.length > 1) {
      domainParts.pop();
      const title = formatTitle(domainParts.join(' '));
      titleCache.set(url, title);
      return title;
    }
    const fallbackTitle = formatTitle(url);
    titleCache.set(url, fallbackTitle);
    return fallbackTitle;
  } catch (error) {
    console.error("Erreur lors de l'extraction du titre :", error);
    const fallbackTitle = formatTitle(url);
    titleCache.set(url, fallbackTitle);
    return fallbackTitle;
  }
}

/**
 * Formate un texte pour en faire un titre
 */
function formatTitle(text) {
  text = text.normalize("NFKD");
  let cleaned = text
    .replace(/[-_+.%20]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ');
  const lowerCaseWords = ['de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'et', 'ou', 'à', 'au', 'aux'];
  const formattedWords = words.map((word, index) => {
    if (index > 0 && lowerCaseWords.includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return formattedWords.join(' ');
}

// Vérifie si un lien existe déjà dans le tableau (en comparant l’URL normalisée)
function isLinkDuplicate(newUrl, excludeIndex = null) {
  try {
    const normalizedNewUrl = normalizeUrl(newUrl);
    if (!normalizedNewUrl) return false;
    const newUrlObj = new URL(normalizedNewUrl);
    const newHostname = newUrlObj.hostname.replace(/^www\./, '');
    const newPathname = newUrlObj.pathname.replace(/\/$/, '');
    const newSearch = newUrlObj.search;
    return links.some((link, index) => {
      if (excludeIndex !== null && index === excludeIndex) return false;
      try {
        const existingObj = new URL(normalizeUrl(link.url));
        return (
          existingObj.hostname.replace(/^www\./, '') === newHostname &&
          existingObj.pathname.replace(/\/$/, '') === newPathname &&
          existingObj.search === newSearch
        );
      } catch (e) {
        console.warn('Invalid existing URL:', link.url);
        return false;
      }
    });
  } catch (e) {
    console.warn('Invalid new URL:', newUrl);
    return false;
  }
}

// Retourne l’URL de la favicon pour un lien donné
function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://icon.horse/icon/${domain}`;
  } catch {
    return "data:image/svg+xml,%3Csvg ...%3E%3C/svg%3E";
  }
}

// ------------------------------
// Fonctions de sauvegarde sur Supabase
// ------------------------------
async function saveToSupabase(table, data, options = {}) {
  try {
    // Pour chaque enregistrement, on s'assure que le user_id est présent
    const dataWithUser = data.map(record => ({ ...record, user_id: currentUserId }));
    const { error } = await supabase.from(table).upsert(dataWithUser, options);
    if (error) throw error;
    if (!options.silent) showToast(`${table} saved successfully`);
  } catch (error) {
    await handleError(error, `saving ${table}`);
  }
}

async function deleteFromSupabase(table, conditions) {
  try {
    // On ajoute la condition sur le user_id
    const { error } = await supabase.from(table).delete().match({ ...conditions, user_id: currentUserId });
    if (error) throw error;
  } catch (error) {
    await handleError(error, `deleting from ${table}`);
  }
}

async function saveLinks() {
  try {
    const linksToSave = links.map(link => ({
      id: link.id,
      title: link.title,
      url: link.url,
      favorite: link.favorite,
      folder_id: link.folder_id || null,
      dateAdded: link.dateAdded,
      subfolderid: link.subfolder_id || null,
      user_id: currentUserId
    }));
    await saveToSupabase('links', linksToSave);
  } catch (error) {
    console.error('Error saving links:', error);
    showToast('Error saving links', 'error');
  }
}

async function saveFolders() {
  try {
    const foldersToSave = folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      date_created: folder.dateCreated || new Date().toISOString(),
      parent_id: folder.parent_id,
      user_id: currentUserId
    }));
    await saveToSupabase('folders', foldersToSave);
  } catch (error) {
    console.error('Error saving folders:', error);
    showToast('Error saving folders', 'error');
  }
}

async function saveNotebooks() {
  try {
    const notebooksToSave = notebooks.map(nb => ({
      id: nb.id,
      name: nb.name,
      collapsed: nb.collapsed,
      user_id: currentUserId
    }));
    const { error: nbError } = await supabase
      .from('notebooks')
      .upsert(notebooksToSave);
    if (nbError) throw nbError;
    const allNotes = notebooks.flatMap(nb =>
      (nb.notes || []).map(note => ({
        id: note.id,
        notebook_id: nb.id,
        title: note.title,
        content: note.content,
        date_created: note.date_created,
        last_modified: note.last_modified,
        user_id: currentUserId
      }))
    );
    if (allNotes.length > 0) {
      const { error: notesError } = await supabase
        .from('notes')
        .upsert(allNotes, { onConflict: ['id'] });
      if (notesError) throw notesError;
    }
  } catch (error) {
    console.error('Error saving notebooks:', error);
    showToast('Error saving notebooks', 'error');
  }
}

// ------------------------------
// Chargement initial des données
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await initializeAuth();
  const elements = {
    addLinkBtn: document.getElementById("headerAddLinkBtn"),
    addLinkForm: document.getElementById("addLinkForm"),
    linkForm: document.getElementById("linkForm"),
    searchInput: document.getElementById("searchInput"),
    linksGrid: document.getElementById("linksGrid"),
    emptyState: document.getElementById("emptyState"),
    toast: document.getElementById("toast"),
    themeToggle: document.getElementById("headerThemeToggle"),
    favoritesToggle: document.getElementById("headerFavoritesToggle"),
    cancelBtn: document.getElementById("cancelBtn"),
    sidebarAddFolderBtn: document.getElementById("sidebarAddFolderBtn"),
    headerAddFolderBtn: document.getElementById("headerAddFolderBtn"),
    sidebarThemeToggle: document.getElementById("sidebarThemeToggle"),
    sidebar: document.getElementById("sidebar"),
    mainContainer: document.getElementById("mainContainer"),
    sidebarCollapseBtn: document.getElementById("sidebarCollapseBtn"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    folderList: document.getElementById("folderList"),
    toggleDatesBtn: document.getElementById("toggleDatesBtn"),
    notesPanel: document.getElementById("notesPanel"),
    toggleNotesBtn: document.getElementById("toggleNotesBtn"),
    closeNotesBtn: document.getElementById("closeNotesBtn"),
    createNotebookBtn: document.getElementById("createNotebookBtn"),
    notebooksList: document.getElementById("notebooksList"),
    formatButtons: document.querySelectorAll(".format-btn"),
    addNoteBtn: document.getElementById("addNoteBtn"),
    moveNoteBtn: document.getElementById("moveNoteBtn"),
    deleteNoteBtn: document.getElementById("deleteNoteBtn"),
    noteTitleInput: document.getElementById("noteTitle"),
    noteEditor: document.getElementById("noteEditor"),
    notePlaceholder: document.getElementById("notePlaceholder")
  };

  // Chargement initial depuis Supabase avec filtrage par user_id
  try {
    const [
      { data: linksData },
      { data: foldersData },
      { data: notebooksData },
      { data: notesData }
    ] = await Promise.all([
      supabase.from('links').select('*').eq('user_id', currentUserId),
      supabase.from('folders').select('*').eq('user_id', currentUserId),
      supabase.from('notebooks').select('*').eq('user_id', currentUserId),
      supabase.from('notes').select('*').eq('user_id', currentUserId)
    ]);
    links = linksData || [];
    folders = foldersData || [];
    notebooks = (notebooksData || []).map(nb => ({
      ...nb,
      notes: (notesData || []).filter(note => note.notebook_id === nb.id)
    }));
  } catch (error) {
    console.error('Error loading initial data:', error);
    showToast('Error loading data', 'error');
  }

  // ------------------------------
  // Rendu des liens
  // ------------------------------
  function createLinkCard(link, index) {
    const template = document.getElementById("linkCardTemplate");
    if (!template) return;
    const cardFragment = template.content.cloneNode(true);
    const article = cardFragment.querySelector(".card.link-card");
    if (!article) return;
    article.dataset.index = index;
    article.dataset.linkId = link.id;
    article.setAttribute("draggable", "true");
    const icon = article.querySelector(".link-icon");
    if (icon) {
      icon.src = getFaviconUrl(link.url);
      icon.alt = `Icon for ${link.title}`;
      icon.onerror = () => {
        icon.src = "data:image/svg+xml,%3Csvg ...%3E%3C/svg%3E";
      };
    }
    const linkTitle = article.querySelector(".link-title");
    if (linkTitle) linkTitle.textContent = link.title;
    const linkUrl = article.querySelector(".link-url");
    if (linkUrl) {
      try {
        const domain = new URL(link.url).hostname;
        linkUrl.textContent = domain;
        linkUrl.addEventListener('click', (e) => {
          e.stopPropagation();
          currentDomainFilter = getDomainFromUrl(link.url);
          document.getElementById('domainFilterBack').hidden = false;
          renderLinks();
          showToast(`Filtering links from ${currentDomainFilter}`);
        });
      } catch {
        linkUrl.textContent = link.url;
      }
    }
    const linkDate = article.querySelector(".link-date");
    if (linkDate) {
      linkDate.textContent = new Date(link.dateAdded).toLocaleDateString();
      linkDate.style.display = showDates ? "block" : "none";
    }
    const starBtn = article.querySelector(".favorite-btn i");
    if (starBtn) {
      starBtn.className = `fa${link.favorite ? "s" : "r"} fa-star`;
    }
    ["edit", "delete", "favorite", "copy"].forEach(action => {
      const btn = article.querySelector(`.${action}-btn`);
      if (btn) btn.dataset.action = action;
    });
    article.setAttribute("tabindex", "0");
    article.addEventListener("keydown", e => {
      if (e.key === "Enter") window.open(link.url, "_blank");
    });
    article.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", link.id);
      e.dataTransfer.effectAllowed = "move";
      article.classList.add("dragging");
    });
    article.addEventListener("dragend", () => {
      article.classList.remove("dragging");
    });
    const actions = article.querySelector('.link-actions');
    if (actions) {
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn btn-icon preview-btn';
      previewBtn.setAttribute('aria-label', 'Preview');
      previewBtn.setAttribute('data-action', 'preview');
      previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
      previewBtn.style.display = showPreviewButton ? 'flex' : 'none';
      actions.appendChild(previewBtn);
    }
    if (actions) {
      const qrBtn = document.createElement('button');
      qrBtn.className = 'btn btn-icon qr-btn';
      qrBtn.setAttribute('aria-label', 'Share QR Code');
      qrBtn.setAttribute('data-action', 'qr');
      qrBtn.innerHTML = '<i class="fas fa-qrcode"></i>';
      qrBtn.style.display = showQrButton ? 'flex' : 'none';
      actions.appendChild(qrBtn);
    }
    return article;
  }

  function renderLinks(filteredLinks = links) {
    const grid = elements.linksGrid;
    const emptyState = elements.emptyState;
    if (!grid || !emptyState) return;
    grid.innerHTML = "";
    let displayLinks = Array.isArray(filteredLinks) ? [...filteredLinks] : [...links];
    if (currentDomainFilter) {
      displayLinks = displayLinks.filter(link =>
        getDomainFromUrl(link.url) === currentDomainFilter
      );
    }
    if (showFavorites) {
      displayLinks = displayLinks.filter(link => link.favorite);
    }
    if (currentFolder !== null) {
      displayLinks = displayLinks.filter(link => link.folder_id === currentFolder);
    }
    if (displayLinks.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    const domainFilter = document.getElementById('domainFilter');
    if (domainFilter) {
      if (currentDomainFilter) {
        domainFilter.hidden = false;
        domainFilter.querySelector('.filter-text').textContent = `Domain: ${currentDomainFilter}`;
      } else {
        domainFilter.hidden = true;
      }
    }
    const domainFilterBack = document.getElementById('domainFilterBack');
    if (domainFilterBack) {
      domainFilterBack.hidden = !currentDomainFilter;
    }
    displayLinks.forEach((link, idx) => {
      const card = createLinkCard(link, links.indexOf(link));
      if (card) {
        card.style.opacity = "0";
        card.style.transform = "translateY(20px)";
        grid.appendChild(card);
        requestAnimationFrame(() => {
          card.style.transition = `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms`;
          card.style.opacity = "1";
          card.style.transform = "translateY(0)";
        });
      }
    });
    updateSidebarBadges();
    initializeLinkDragAndDrop();
  }

  function initializeLinkDragAndDrop() {
    const grid = elements.linksGrid;
    const cards = grid.querySelectorAll(".card.link-card");
    let dragSrcIndex = null;
    cards.forEach(card => {
      card.addEventListener("dragstart", e => {
        dragSrcIndex = parseInt(card.dataset.index, 10);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", card.outerHTML);
        card.classList.add("dragging");
      });
      card.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
        return false;
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", e => {
        e.stopPropagation();
        card.classList.remove("drag-over");
        const targetIndex = parseInt(card.dataset.index, 10);
        if (dragSrcIndex === null || targetIndex === dragSrcIndex) return false;
        const draggedLink = links[dragSrcIndex];
        links.splice(dragSrcIndex, 1);
        links.splice(targetIndex, 0, draggedLink);
        saveLinks();
        renderLinks();
        showToast("Ordre des liens mis à jour");
        return false;
      });
      card.addEventListener("dragend", () => {
        cards.forEach(c => c.classList.remove("dragging", "drag-over"));
        dragSrcIndex = null;
      });
    });
  }

  // ------------------------------
  // Formulaire d'ajout / édition de lien
  // ------------------------------
  if (elements.addLinkBtn) {
    elements.addLinkBtn.addEventListener("click", () => {
      const form = elements.addLinkForm;
      if (!form) return;
      if (form.hidden) {
        form.hidden = false;
        form.classList.add("animate-slide");
        form.classList.remove("animate-slide-out");
      } else closeFormWithAnimation();
    });
  }

  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener("click", () => {
      closeFormWithAnimation();
      elements.linkForm?.reset();
    });
  }

  if (elements.linkForm) {
    elements.linkForm.addEventListener("submit", async e => {
      e.preventDefault();
      const titleEl = document.getElementById("linkTitle");
      const urlEl = document.getElementById("linkUrl");
      const folderEl = document.getElementById("linkFolder");
      const submitBtn = elements.linkForm.querySelector('button[type="submit"]');
      const cardTitle = elements.addLinkForm.querySelector(".card-title");
      if (!titleEl || !urlEl || !folderEl) {
        showToast("Missing form elements", "error");
        return;
      }
      submitBtn.disabled = true;
      try {
        const normalizedUrl = normalizeUrl(urlEl.value);
        new URL(normalizedUrl);
        if (isLinkDuplicate(normalizedUrl, isEditing ? editingIndex : null)) {
          throw new Error("Link already exists");
        }
        const title = titleEl.value.trim() || extractTitleFromUrl(normalizedUrl);
        const folderId = folderEl.value === "null" ? null : folderEl.value;
        if (isEditing) {
          const { error } = await supabase
            .from('links')
            .update({ title, url: normalizedUrl, folder_id: folderId })
            .eq('id', links[editingIndex].id)
            .eq('user_id', currentUserId);
          if (error) throw error;
          const oldLink = { ...links[editingIndex] };
          links[editingIndex] = { ...oldLink, title, url: normalizedUrl, folder_id: folderId };
          undoStack.push({ type: "EDIT_LINK", oldLink, newLink: { ...links[editingIndex] } });
          showToast("Link modified successfully");
        } else {
          const newLink = {
            id: generateId(),
            title,
            url: normalizedUrl,
            favorite: false,
            folder_id: folderId || null,
            dateAdded: new Date().toISOString(),
            user_id: currentUserId
          };
          const { data, error } = await supabase.from('links').insert([newLink]).select().single();
          if (error) throw error;
          links.unshift({ ...data });
          undoStack.push({ type: "ADD_LINK", link: { ...data } });
          showToast("Link added successfully");
        }
        closeFormWithAnimation();
        e.target.reset();
        if (submitBtn && cardTitle) {
          submitBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add</span>';
          cardTitle.textContent = "Add new link";
        }
        isEditing = false;
        editingIndex = null;
        requestAnimationFrame(renderLinks);
      } catch (error) {
        showToast(error.message || "Invalid URL", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function closeFormWithAnimation() {
    const form = elements.addLinkForm;
    if (!form) return;
    form.style.transform = "translateY(-20px)";
    form.style.opacity = "0";
    setTimeout(() => {
      form.hidden = true;
      form.style.transform = "";
      form.style.opacity = "";
      if (isEditing) {
        isEditing = false;
        editingIndex = null;
        const submitBtn = form.querySelector('button[type="submit"]');
        const cardTitle = form.querySelector(".card-title");
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add</span>';
        if (cardTitle) cardTitle.textContent = "Add new link";
      }
    }, 300);
  }

  function startEditing(link, index) {
    isEditing = true;
    editingIndex = index;
    const form = elements.addLinkForm;
    const titleEl = document.getElementById("linkTitle");
    const urlEl = document.getElementById("linkUrl");
    const submitBtn = form?.querySelector('button[type="submit"]');
    const cardTitle = form?.querySelector(".card-title");
    if (!form || !titleEl || !urlEl || !submitBtn || !cardTitle) return;
    cardTitle.textContent = "Edit link";
    titleEl.value = link.title;
    urlEl.value = link.url.replace(/^https?:\/\//i, "");
    submitBtn.innerHTML = '<i class="fas fa-save"></i><span>Update</span>';
    form.hidden = false;
    form.classList.add("animate-slide");
    form.classList.remove("animate-slide-out");
  }

  // ------------------------------
  // Gestion des clics sur les liens
  // ------------------------------
  if (elements.linksGrid) {
    elements.linksGrid.addEventListener("click", async e => {
      const card = e.target.closest(".card.link-card");
      if (!card) return;
      const linkId = card.dataset.linkId;
      const index = parseInt(card.dataset.index, 10);
      if (isNaN(index) || index < 0 || index >= links.length) return;
      const target = e.target.closest("[data-action]");
      if (!target) {
        window.open(links[index].url, "_blank");
        return;
      }
      switch (target.dataset.action) {
        case "favorite": {
          const newFav = !links[index].favorite;
          try {
            const { error } = await supabase.from('links').update({ favorite: newFav }).eq('id', linkId).eq('user_id', currentUserId);
            if (error) throw error;
            links[index].favorite = newFav;
            await renderLinks();
            updateSidebarBadges();
          } catch (error) {
            console.error('Error updating favorite status:', error);
            showToast('Error updating favorite status', 'error');
          }
          break;
        }
        case "edit":
          startEditing(links[index], index);
          break;
        case "delete":
          await deleteLink(linkId);

          break;
        case "copy":
          try {
            await navigator.clipboard.writeText(links[index].url);
            showToast("Link copied to clipboard");
          } catch (error) {
            showToast("Failed to copy link", "error");
          }
          break;
        case "preview":
          showPreview(links[index].url);
          break;
        case "qr":
          showQrCode(links[index].url);
          break;
        default:
          break;
      }
    });
  }

  // ------------------------------
  // Gestion des dossiers
  // ------------------------------
  function renderFolders() {
    const folderList = elements.folderList;
    if (!folderList) return;
    const totalLinks = links.length;
    folderList.innerHTML = `
      <div class="folder-item">
        <button class="btn ${!currentFolder ? "active" : ""}" data-folder="null" draggable="true" data-index="-1">
          <i class="fas fa-home"></i>
          <span>All links</span>
          <span class="folder-count">${totalLinks}</span>
        </button>
      </div>
      ${folders.map((folder, index) => {
      const count = links.filter(link => link.folder_id === folder.id).length;
      const favCount = links.filter(link => link.folder_id === folder.id && link.favorite).length;
      return `
          <div class="folder-item">
            <button class="btn ${currentFolder === folder.id ? "active" : ""}" data-folder="${folder.id}" draggable="true" data-index="${index}">
              <i class="fas fa-folder${currentFolder === folder.id ? "-open" : ""}"></i>
              <span>${folder.name}</span>
              <span class="folder-count">${count}${favCount ? " ★" : ""}</span>
            </button>
          </div>
        `;
    }).join('')}
    `;
    const folderSelect = document.getElementById("linkFolder");
    if (folderSelect) {
      folderSelect.innerHTML = `
        <option value="null">No folder</option>
        ${folders.map(folder => `<option value="${folder.id}" ${currentFolder === folder.id ? "selected" : ""}>${folder.name}</option>`).join('')}
      `;
    }
    initializeFolderDragAndDrop();
  }

  function initializeFolderDragAndDrop() {
    const folderButtons = elements.folderList.querySelectorAll('.btn[data-folder]');
    let dragSrcIndex = null;
    folderButtons.forEach(btn => {
      btn.addEventListener('dragstart', e => {
        dragSrcIndex = parseInt(btn.dataset.index, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', btn.outerHTML);
        btn.classList.add('dragging');
      });
      btn.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drag-over');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
      btn.addEventListener('drop', e => {
        e.stopPropagation();
        btn.classList.remove('drag-over');
        const targetIndex = parseInt(btn.dataset.index, 10);
        if (dragSrcIndex === null || targetIndex === dragSrcIndex) return;
        const draggedFolder = folders[dragSrcIndex];
        folders.splice(dragSrcIndex, 1);
        folders.splice(targetIndex, 0, draggedFolder);
        saveFolders();
        renderFolders();
        showToast("Ordre des dossiers mis à jour");
      });
      btn.addEventListener('dragend', () => {
        folderButtons.forEach(b => b.classList.remove('dragging', 'drag-over'));
        dragSrcIndex = null;
      });
    });
  }

  async function createFolder(name, parentId = null) {
    const trimmed = name.trim();
    if (!trimmed) return showToast("Folder name cannot be empty", "error");
    if (trimmed.length > 30) return showToast("Folder name too long (max 30 characters)", "error");
    if (!/^[\w\s-]+$/i.test(trimmed)) return showToast("Folder name contains invalid characters", "error");
    if (folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase()))
      return showToast("A folder with this name already exists", "error");
    const newFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: trimmed,
      date_created: new Date().toISOString(),
      parent_id: parentId,
      user_id: currentUserId
    };
    try {
      const { data, error } = await supabase.from('folders').insert([newFolder]).select().single();
      if (error) throw error;
      folders.push(data);
      renderFolders();
      animateNewFolder(data.id);
      showToast("Folder created successfully");
      return data;
    } catch (error) {
      console.error('Error creating folder:', error);
      showToast('Error creating folder', 'error');
      return null;
    }
  }

  function animateNewFolder(folderId) {
    requestAnimationFrame(() => {
      const newFolderElement = document.querySelector(`[data-folder="${folderId}"]`);
      if (newFolderElement) newFolderElement.style.animation = 'folderAppear 0.3s ease-out';
    });
  }

  function createFolderPrompt() {
    const existingModal = document.querySelector('.modal');
    if (existingModal) existingModal.remove();
    const modal = document.createElement('div');
    modal.className = 'modal animate-fade';
    modal.innerHTML = `
      <div class="modal-content animate-slide">
        <h3>New folder</h3>
        <div class="form-group">
          <input type="text" id="folderNameInput" class="form-control" placeholder="Folder name" maxlength="30">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelFolderBtn">Cancel</button>
          <button class="btn btn-primary" id="confirmFolderBtn">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('#folderNameInput');
    const confirmBtn = modal.querySelector('#confirmFolderBtn');
    const cancelBtn = modal.querySelector('#cancelFolderBtn');
    const closeModal = () => {
      modal.style.opacity = '0';
      modal.style.visibility = 'hidden';
      setTimeout(() => modal.remove(), 300);
    };
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    cancelBtn?.addEventListener('click', closeModal);
    confirmBtn?.addEventListener('click', () => {
      const name = input.value.trim();
      if (name) { createFolder(name); closeModal(); }
    });
    input?.addEventListener('keyup', e => {
      if (e.key === 'Enter' && input.value.trim()) { createFolder(input.value.trim()); closeModal(); }
      if (e.key === 'Escape') closeModal();
    });
    requestAnimationFrame(() => {
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
      setTimeout(() => input?.focus(), 100);
    });
  }

  if (elements.folderList) {
    elements.folderList.addEventListener("click", async e => {
      const btn = e.target.closest("[data-folder]");
      if (!btn) return;
      const newFolderId = btn.dataset.folder === "null" ? null : btn.dataset.folder;
      try {
        const selectedLinks = links.filter(link => link.selected);
        if (selectedLinks.length > 0) {
          const { error } = await supabase.from('links').update({ folder_id: newFolderId }).in('id', selectedLinks.map(l => l.id)).eq('user_id', currentUserId);
          if (error) throw error;
        }
        currentFolder = newFolderId;
        renderFolders();
        renderLinks();
      } catch (error) {
        console.error('Error updating folder assignment:', error);
        showToast('Error updating folder assignment', 'error');
      }
    });
    elements.folderList.addEventListener("contextmenu", e => {
      const btn = e.target.closest("[data-folder]");
      if (!btn) return;
      const folderId = btn.dataset.folder;
      if (folderId === "null") return;
      e.preventDefault();
      createContextMenu(e.pageX, e.pageY, folderId);
    });
  }

  function createContextMenu(x, y, folderId) {
    removeContextMenu();
    const menu = document.createElement("div");
    menu.className = "folder-context-menu";
    menu.innerHTML = `
      <div class="folder-context-menu-item rename">
        <i class="fas fa-edit"></i>
        <span>Rename</span>
      </div>
      <div class="folder-context-menu-item delete">
        <i class="fas fa-trash"></i>
        <span>Delete</span>
      </div>
    `;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    document.body.appendChild(menu);
    requestAnimationFrame(() => menu.classList.add("active"));
    menu.addEventListener("click", e => {
      const item = e.target.closest(".folder-context-menu-item");
      if (!item) return;
      if (item.classList.contains("delete")) deleteFolder(folderId);
      else if (item.classList.contains("rename")) startFolderRename(folderId);
      removeContextMenu();
    });
  }

  function removeContextMenu() {
    const existing = document.querySelector(".folder-context-menu");
    if (existing) existing.remove();
  }

  async function deleteFolder(folderId) {
    if (!confirm("Do you really want to delete this folder?")) return;
    try {
      const { error: updateChildError } = await supabase.from('folders').update({ parent_id: null }).eq('parent_id', folderId).eq('user_id', currentUserId);
      if (updateChildError) throw updateChildError;
      const { error: updateLinksError } = await supabase.from('links').update({ folder_id: null }).eq('folder_id', folderId).eq('user_id', currentUserId);
      if (updateLinksError) throw updateLinksError;
      const { error: deleteError } = await supabase.from('folders').delete().eq('id', folderId).eq('user_id', currentUserId);
      if (deleteError) throw deleteError;
      folders = folders.filter(f => f.id !== folderId);
      links = links.map(link => link.folder_id === folderId ? { ...link, folder_id: null } : link);
      currentFolder = null;
      renderFolders();
      renderLinks();
      showToast("Folder deleted successfully");
    } catch (error) {
      console.error('Error deleting folder:', error);
      showToast('Error deleting folder', 'error');
    }
  }

  async function startFolderRename(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const folderBtn = document.querySelector(`[data-folder="${folderId}"]`);
    if (!folderBtn) return;
    const oldName = folder.name;
    const nameSpan = folderBtn.querySelector('span');
    if (!nameSpan) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-rename-input';
    input.value = folder.name;
    input.maxLength = 30;
    nameSpan.style.display = 'none';
    nameSpan.parentNode.insertBefore(input, nameSpan);
    input.focus();
    input.select();
    const finishRename = async (save) => {
      if (save && input.value.trim() && input.value !== oldName) {
        const newName = input.value.trim();
        try {
          const { error } = await supabase.from('folders').update({ name: newName }).eq('id', folderId).eq('user_id', currentUserId);
          if (error) throw error;
          folder.name = newName;
          renderFolders();
          showToast('Folder renamed successfully');
        } catch (error) {
          console.error('Error renaming folder:', error);
          showToast('Error renaming folder', 'error');
          folder.name = oldName;
          renderFolders();
        }
      }
      nameSpan.style.display = '';
      input.remove();
    };
    input.addEventListener('blur', () => finishRename(true));
    input.addEventListener('keyup', e => {
      if (e.key === 'Enter') finishRename(true);
      if (e.key === 'Escape') finishRename(false);
    });
  }

  document.addEventListener("click", e => {
    if (!e.target.closest(".folder-context-menu")) removeContextMenu();
  });
  document.addEventListener("scroll", removeContextMenu);

  // ------------------------------
  // Gestion des Notebooks et Notes
  // ------------------------------
  function renderNotebooks() {
    const notebooksList = elements.notebooksList;
    if (!notebooksList) return;
    notebooksList.innerHTML = "";
    notebooks.forEach(notebook => {
      const notebookItem = document.createElement("div");
      notebookItem.classList.add("notebook-item");
      const isActive = notebook.id === currentNotebookId ? "active" : "";
      notebookItem.innerHTML = `
        <div class="notebook-title ${notebook.collapsed ? "collapsed" : ""} ${isActive}">
          <div class="notebook-title-left" data-id="${notebook.id}">
            <i class="fas ${notebook.id === currentNotebookId ? "fa-book-open" : "fa-book"}"></i>
            <span class="notebook-name">${notebook.name}</span>
          </div>
          <div class="notebook-actions">
            <button class="notebook-action-btn edit" data-id="${notebook.id}" title="Rename">
              <i class="fas fa-edit"></i>
            </button>
            <button class="notebook-action-btn delete" data-id="${notebook.id}" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
            <i class="fas fa-chevron-down collapse-icon"></i>
          </div>
        </div>
        <div class="notes-sublist ${notebook.collapsed ? "collapsed" : ""}">
          ${notebook.notes.map(note => `
            <div class="note-item ${note.id === currentNoteId ? "active" : ""}" data-note-id="${note.id}" draggable="true">
              <i class="fas ${note.id === currentNoteId ? "fa-file-alt" : "fa-file"}"></i>
              <span>${note.title || "Untitled Note"}</span>
              <button class="note-delete-btn" title="Delete Note">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
      const editBtn = notebookItem.querySelector(".edit");
      const deleteBtn = notebookItem.querySelector(".delete");
      const titleLeft = notebookItem.querySelector(".notebook-title-left");
      editBtn?.addEventListener("click", e => { e.stopPropagation(); handleNotebookRename(notebook.id); });
      deleteBtn?.addEventListener("click", e => { e.stopPropagation(); handleNotebookDelete(notebook.id); });
      titleLeft?.addEventListener("click", () => selectNotebook(notebook.id));
      const noteItems = notebookItem.querySelectorAll(".note-item");
      noteItems.forEach(noteItem => {
        noteItem.addEventListener("click", e => {
          if (e.target.closest(".note-delete-btn")) return;
          const noteId = noteItem.dataset.noteId;
          selectNotebook(notebook.id);
          selectNote(noteId);
        });
        const deleteNoteBtn = noteItem.querySelector(".note-delete-btn");
        deleteNoteBtn?.addEventListener("click", e => { e.stopPropagation(); handleNoteDelete(notebook.id, noteItem.dataset.noteId); });
      });
      notebooksList.appendChild(notebookItem);
    });
    initializeNotesDragAndDrop();
  }

  function initializeNotesDragAndDrop() {
    const notebooksList = elements.notebooksList;
    if (!notebooksList) return;
    let draggedNote = null, sourceNotebookId = null;
    notebooksList.querySelectorAll('.note-item').forEach(note => {
      note.addEventListener('dragstart', e => {
        draggedNote = note;
        sourceNotebookId = findParentNotebookId(note);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', note.dataset.noteId);
        note.classList.add('dragging');
      });
      note.addEventListener('dragend', () => {
        draggedNote?.classList.remove('dragging');
        draggedNote = null;
        sourceNotebookId = null;
        notebooksList.querySelectorAll('.note-item').forEach(n => n.classList.remove('drag-over'));
      });
      note.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        note.classList.add('drag-over');
      });
      note.addEventListener('dragleave', () => note.classList.remove('drag-over'));
      note.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        note.classList.remove('drag-over');
        const targetNoteId = note.dataset.noteId;
        const targetNotebookId = findParentNotebookId(note);
        if (!draggedNote || targetNoteId === draggedNote.dataset.noteId) return;
        if (sourceNotebookId === targetNotebookId) {
          const notebook = notebooks.find(nb => nb.id === sourceNotebookId);
          if (!notebook) return;
          const draggedIndex = notebook.notes.findIndex(n => n.id === draggedNote.dataset.noteId);
          const targetIndex = notebook.notes.findIndex(n => n.id === targetNoteId);
          if (draggedIndex === -1 || targetIndex === -1) return;
          const [movedNote] = notebook.notes.splice(draggedIndex, 1);
          notebook.notes.splice(targetIndex, 0, movedNote);
          saveNotebooks();
          renderNotebooks();
          showToast("Ordre des notes mis à jour");
        } else {
          const sourceNB = notebooks.find(nb => nb.id === sourceNotebookId);
          const targetNB = notebooks.find(nb => nb.id === targetNotebookId);
          if (!sourceNB || !targetNB) return;
          const draggedIndex = sourceNB.notes.findIndex(n => n.id === draggedNote.dataset.noteId);
          const targetIndex = targetNB.notes.findIndex(n => n.id === targetNoteId);
          if (draggedIndex === -1 || targetIndex === -1) return;
          const [movedNote] = sourceNB.notes.splice(draggedIndex, 1);
          targetNB.notes.splice(targetIndex, 0, movedNote);
          saveNotebooks();
          renderNotebooks();
          showToast("Note déplacée vers un autre notebook");
        }
      });
    });
    notebooksList.querySelectorAll('.notes-sublist').forEach(sublist => {
      sublist.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        sublist.classList.add('drag-over');
      });
      sublist.addEventListener('dragleave', () => sublist.classList.remove('drag-over'));
      sublist.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        sublist.classList.remove('drag-over');
        if (!draggedNote) return;
        const targetNotebookId = findParentNotebookId(sublist);
        const sourceNB = notebooks.find(nb => nb.id === sourceNotebookId);
        const targetNB = notebooks.find(nb => nb.id === targetNotebookId);
        if (!sourceNB || !targetNB) return;
        const draggedIndex = sourceNB.notes.findIndex(n => n.id === draggedNote.dataset.noteId);
        if (draggedIndex === -1) return;
        const [movedNote] = sourceNB.notes.splice(draggedIndex, 1);
        targetNB.notes.push(movedNote);
        saveNotebooks();
        renderNotebooks();
        showToast("Note déplacée vers un autre notebook");
      });
    });
  }

  function findParentNotebookId(element) {
    const notebookItem = element.closest('.notebook-item');
    if (!notebookItem) return null;
    const titleLeft = notebookItem.querySelector('.notebook-title-left');
    return titleLeft ? titleLeft.dataset.id : null;
  }

  function renderSelectedNote() {
    if (!elements.noteEditor || !elements.noteTitleInput || !elements.notePlaceholder) return;
    if (!currentNotebookId || !currentNoteId) {
      elements.notePlaceholder.style.display = "block";
      elements.noteTitleInput.style.display = "none";
      elements.noteEditor.style.display = "none";
      elements.noteEditor.innerHTML = "";
      elements.noteTitleInput.value = "";
      return;
    }
    const notebook = notebooks.find(nb => nb.id === currentNotebookId);
    if (!notebook) return;
    const note = notebook.notes.find(n => n.id === currentNoteId);
    if (!note) return;
    elements.notePlaceholder.style.display = "none";
    elements.noteTitleInput.style.display = "block";
    elements.noteEditor.style.display = "block";
    elements.noteTitleInput.value = note.title || "Untitled Note";
    elements.noteEditor.innerHTML = note.content || "";
    updateFormatButtonStates();
  }

  function selectNotebook(notebookId) {
    currentNotebookId = notebookId;
    currentNoteId = null;
    renderNotebooks();
    renderSelectedNote();
  }

  function selectNote(noteId) {
    currentNoteId = noteId;
    renderSelectedNote();
  }

  function showNotebookPrompt() {
    const modal = document.createElement('div');
    modal.className = 'modal animate-fade';
    modal.innerHTML = `
      <div class="modal-content animate-slide">
        <h3>New Notebook</h3>
        <div class="form-group">
          <input type="text" id="notebookNameInput" class="form-control" placeholder="Notebook name" maxlength="30">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelNotebookBtn">Cancel</button>
          <button class="btn btn-primary" id="confirmNotebookBtn">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('#notebookNameInput');
    const confirmBtn = modal.querySelector('#confirmNotebookBtn');
    const cancelBtn = modal.querySelector('#cancelNotebookBtn');
    input?.focus();
    const handleCreate = () => {
      const name = input.value.trim();
      if (name) { createNotebook(name); modal.remove(); }
      else showToast('Please enter a valid notebook name', 'error');
    };
    confirmBtn?.addEventListener('click', handleCreate);
    cancelBtn?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    input?.addEventListener('keyup', e => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') modal.remove();
    });
  }

  async function createNotebook(name) {
    const trimmed = name.trim();
    if (!trimmed) return showToast('Notebook name cannot be empty', 'error');
    if (notebooks.some(nb => nb.name.toLowerCase() === trimmed.toLowerCase()))
      return showToast('A notebook with this name already exists', 'error');
    const newNotebook = {
      id: generateId(),
      name: trimmed,
      collapsed: false,
      user_id: currentUserId
    };
    try {
      const { data, error } = await supabase
        .from('notebooks')
        .insert([{
          id: newNotebook.id,
          name: newNotebook.name,
          collapsed: newNotebook.collapsed,
          user_id: currentUserId
        }])
        .select()
        .single();
      if (error) throw error;
      notebooks.push({ ...data, notes: [] });
      currentNotebookId = data.id;
      renderNotebooks();
      showToast('Notebook created successfully');
    } catch (error) {
      console.error('Error creating notebook:', error);
      showToast('Error creating notebook', 'error');
    }
  }

  async function addNote() {
    if (!currentNotebookId) {
      const defaultNotebook = {
        id: generateId(),
        name: "My Notes",
        notes: [],
        collapsed: false,
        user_id: currentUserId
      };
      try {
        const { data, error } = await supabase.from('notebooks').insert([defaultNotebook]).select().single();
        if (error) throw error;
        const notebook = { ...data, notes: [] };
        notebooks.push(notebook);
        currentNotebookId = notebook.id;
      } catch (error) {
        console.error('Error creating default notebook:', error);
        showToast('Error creating notebook', 'error');
        return;
      }
    }
    const currentNotebook = notebooks.find(nb => nb.id === currentNotebookId);
    if (!currentNotebook) return;
    const newNote = {
      id: generateId(),
      notebook_id: currentNotebookId,
      title: "New Note",
      content: "",
      date_created: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      user_id: currentUserId
    };
    try {
      const { data, error } = await supabase.from('notes').insert([newNote]).select().single();
      if (error) throw error;
      if (!currentNotebook.notes) {
        currentNotebook.notes = [];
      }
      currentNotebook.notes.unshift(data);
      currentNoteId = data.id;
      renderNotebooks();
      renderSelectedNote();
      showToast("Note created successfully");
    } catch (error) {
      console.error('Error creating note:', error);
      showToast('Error creating note', 'error');
    }
  }

  async function deleteNote() {
    if (!currentNotebookId || !currentNoteId) { alert("No note selected."); return; }
    const notebook = notebooks.find(nb => nb.id === currentNotebookId);
    if (!notebook) return;
    const noteIndex = notebook.notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;
    const deletedNote = { ...notebook.notes[noteIndex] };
    notebook.notes.splice(noteIndex, 1);
    currentNoteId = null;
    undoStack.push({ type: "DELETE_NOTE", notebookId: currentNotebookId, note: deletedNote });
    saveNotebooks();
    renderNotebooks();
    renderSelectedNote();
    showToast("Note deleted");
  }

  async function moveNote(noteId, targetNotebookId) {
    try {
      const { error } = await supabase.from('notes').update({ notebook_id: targetNotebookId }).eq('id', noteId).eq('user_id', currentUserId);
      if (error) throw error;
      const sourceNB = notebooks.find(nb => nb.notes.some(n => n.id === noteId));
      const targetNB = notebooks.find(nb => nb.id === targetNotebookId);
      if (sourceNB && targetNB) {
        const noteIndex = sourceNB.notes.findIndex(n => n.id === noteId);
        const [movedNote] = sourceNB.notes.splice(noteIndex, 1);
        targetNB.notes.push(movedNote);
        renderNotebooks();
        showToast("Note moved successfully");
      }
    } catch (error) {
      console.error('Error moving note:', error);
      showToast('Error moving note', 'error');
    }
  }

  function applyFormat(format) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.extractContents();
    let formattedNode;
    switch (format) {
      case 'bold': formattedNode = document.createElement('strong'); break;
      case 'italic': formattedNode = document.createElement('em'); break;
      default: formattedNode = document.createElement('span');
    }
    formattedNode.appendChild(selectedText);
    range.insertNode(formattedNode);
    selection.removeAllRanges();
    selection.addRange(range);
    saveCurrentNoteContent();
  }

  async function saveCurrentNoteContent() {
    if (!currentNotebookId || !currentNoteId) return;
    const notebook = notebooks.find(nb => nb.id === currentNotebookId);
    if (!notebook) return;
    const note = notebook.notes.find(n => n.id === currentNoteId);
    if (!note) return;
    const titleVal = elements.noteTitleInput.value.trim() || "Untitled Note";
    const newContent = elements.noteEditor.innerHTML;
    if (note.title !== titleVal || note.content !== newContent) {
      const updatedNote = { title: titleVal, content: newContent, last_modified: new Date().toISOString() };
      try {
        const { error } = await supabase.from('notes').update(updatedNote).eq('id', currentNoteId).eq('user_id', currentUserId);
        if (error) throw error;
        Object.assign(note, updatedNote);
        renderNotebooks();
      } catch (error) {
        console.error('Error updating note:', error);
        showToast('Error saving note', 'error');
      }
    }
  }

  function updateFormatButtonStates() {
    const formats = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      h1: 'formatBlock',
      h2: 'formatBlock',
      h3: 'formatBlock',
      insertUnorderedList: 'insertUnorderedList',
      insertOrderedList: 'insertOrderedList'
    };
    Object.entries(formats).forEach(([format, command]) => {
      const button = document.querySelector(`[data-format="${format}"]`);
      if (button) {
        if (command === 'formatBlock') {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let parent = range.startContainer.parentElement;
            while (parent && parent !== elements.noteEditor) {
              if (parent.tagName.toLowerCase() === format) {
                button.classList.add("active");
                break;
              }
              parent = parent.parentElement;
            }
            if (parent === elements.noteEditor) button.classList.remove("active");
          }
        } else {
          if (document.queryCommandState(command)) button.classList.add("active");
          else button.classList.remove("active");
        }
      }
    });
  }

  if (elements.formatButtons) {
    elements.formatButtons.forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        const format = btn.dataset.format;
        if (!format) return;
        if (["h1", "h2", "h3"].includes(format))
          document.execCommand("formatBlock", false, format.toUpperCase());
        else document.execCommand(format, false, null);
        if (!["insertOrderedList", "insertUnorderedList"].includes(format)) btn.classList.toggle("active");
        saveCurrentNoteContent();
      });
    });
  }

  if (elements.noteEditor) {
    elements.noteEditor.addEventListener("input", debounce(saveCurrentNoteContent, 500));
    elements.noteEditor.addEventListener("keyup", updateFormatButtonStates);
    elements.noteEditor.addEventListener("mouseup", updateFormatButtonStates);
  }
  if (elements.noteTitleInput) {
    elements.noteTitleInput.addEventListener("input", debounce(() => {
      saveCurrentNoteContent();
      renderNotebooks();
    }, 500));
  }

  if (elements.noteEditor) {
    elements.noteEditor.addEventListener('paste', async (e) => {
      e.preventDefault();

      // Gérer le collage de texte normal
      if (e.clipboardData.getData('text/plain')) {
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }

      // Gérer le collage d'images
      const items = Array.from(e.clipboardData.items);
      for (const item of items) {
        if (item.type.startsWith('image')) {
          const file = item.getAsFile();
          const loadingId = 'img-loading-' + Date.now();

          // Insérer un placeholder pendant le chargement
          const loadingElement = `<div id="${loadingId}" class="image-loading">
                    <i class="fas fa-spinner fa-spin"></i>Uploading image...
                </div>`;
          document.execCommand('insertHTML', false, loadingElement);

          try {
            // Convertir l'image en Base64
            const base64 = await convertImageToBase64(file);

            // Uploader l'image vers le storage Supabase
            const { data, error } = await supabase.storage
              .from('notes-images')
              .upload(`${currentUserId}/${Date.now()}-${file.name}`, file);

            if (error) throw error;

            // Obtenir l'URL publique de l'image
            const { data: { publicUrl } } = supabase.storage
              .from('notes-images')
              .getPublicUrl(data.path);

            // Remplacer le placeholder par l'image
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) {
              const img = `<img src="${publicUrl}" alt="Pasted image">`;
              loadingElement.outerHTML = img;
            }

            // Sauvegarder le contenu de la note
            await saveCurrentNoteContent();

          } catch (error) {
            console.error('Error uploading image:', error);
            showToast('Error uploading image', 'error');

            // Supprimer le placeholder en cas d'erreur
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) {
              loadingElement.remove();
            }
          }
        }
      }
    });
  }

  // Fonction utilitaire pour convertir une image en Base64
  function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  elements.notebooksList.addEventListener('click', e => {
    const collapseIcon = e.target.closest('.collapse-icon');
    if (!collapseIcon) return;
    const notebookItem = collapseIcon.closest('.notebook-item');
    if (!notebookItem) return;
    const sublist = notebookItem.querySelector('.notes-sublist');
    if (!sublist) return;
    const isCollapsed = sublist.classList.toggle('collapsed');
    collapseIcon.classList.toggle('fa-chevron-down', !isCollapsed);
    collapseIcon.classList.toggle('fa-chevron-right', isCollapsed);
    const nbId = notebookItem.querySelector('.notebook-title-left').dataset.id;
    const notebook = notebooks.find(nb => nb.id === nbId);
    if (notebook) { notebook.collapsed = isCollapsed; saveNotebooks(); }
  });

  const domainFilter = document.getElementById('domainFilter');
  if (domainFilter) {
    const clearBtn = domainFilter.querySelector('.clear-filter');
    clearBtn?.addEventListener('click', () => {
      currentDomainFilter = null;
      renderLinks();
      showToast('Domain filter cleared');
    });
  }

  const domainFilterBack = document.getElementById('domainFilterBack');
  if (domainFilterBack) {
    domainFilterBack.addEventListener('click', () => {
      currentDomainFilter = null;
      domainFilterBack.hidden = true;
      renderLinks();
      showToast('Showing all links');
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const newTheme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeButtonIcons();
  }

  function updateThemeButtonIcons() {
    const current = document.documentElement.getAttribute("data-theme");
    document.querySelectorAll(".fa-moon, .fa-sun").forEach(icon => {
      if (current === "dark") {
        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");
      } else {
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
      }
    });
  }

  function toggleSidebar() {
    const sidebar = elements.sidebar, main = elements.mainContainer, btn = elements.sidebarCollapseBtn;
    if (!sidebar || !main) return;
    const willCollapse = !sidebar.classList.contains("collapsed");
    sidebar.classList.toggle("collapsed");
    main.classList.toggle("sidebar-collapsed");
    sidebar.setAttribute("aria-expanded", (!willCollapse).toString());
    localStorage.setItem("sidebarCollapsed", willCollapse.toString());
    const icon = btn?.querySelector("i");
    if (icon) icon.style.transform = willCollapse ? "rotate(180deg)" : "";
  }

  function initializeSidebar() {


    const sidebar = elements.sidebar;
    const main = elements.mainContainer;
    const btn = elements.sidebarCollapseBtn;
    const mobileBtn = elements.mobileMenuBtn;

    if (!sidebar || !main) return;

    // Création de l'overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Gestion du clic sur le bouton mobile
    mobileBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("mobile-visible");
      overlay.classList.toggle("active");
      const icon = mobileBtn.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-bars");
        icon.classList.toggle("fa-times");
      }
    });

    // Fermeture lors du clic sur l'overlay
    overlay.addEventListener('click', () => {
      sidebar.classList.remove("mobile-visible");
      overlay.classList.remove("active");
      const icon = mobileBtn.querySelector("i");
      if (icon) {
        icon.classList.add("fa-bars");
        icon.classList.remove("fa-times");
      }
    });

    // Gestion des clics en dehors de la sidebar
    document.addEventListener("click", (e) => {
      if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !mobileBtn.contains(e.target) &&
        sidebar.classList.contains("mobile-visible")) {
        sidebar.classList.remove("mobile-visible");
        overlay.classList.remove("active");
        const icon = mobileBtn.querySelector("i");
        if (icon) {
          icon.classList.add("fa-bars");
          icon.classList.remove("fa-times");
        }
      }
    });

    // Fermeture de la sidebar lors du redimensionnement
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        sidebar.classList.remove("mobile-visible");
        overlay.classList.remove("active");
        const icon = mobileBtn?.querySelector("i");
        if (icon) {
          icon.classList.add("fa-bars");
          icon.classList.remove("fa-times");
        }
      }
    });



  }

  function updateSidebarBadges() {
    const totalEl = document.getElementById("totalLinksCount");
    const favEl = document.getElementById("favoritesCount");
    if (totalEl) totalEl.textContent = links.length;
    if (favEl) favEl.textContent = links.filter(l => l.favorite).length;
  }

  function initializeSidebarEvents() {
    document.querySelectorAll(".sidebar-item[data-view]").forEach(item => {
      item.addEventListener("click", e => {
        const view = e.currentTarget.dataset.view;
        document.querySelectorAll(".sidebar-item[data-view]").forEach(i => i.classList.remove("active"));
        e.currentTarget.classList.add("active");
        switch (view) {
          case "links":
            showFavorites = false; currentFolder = null; break;
          case "favorites":
            showFavorites = true; currentFolder = null; break;
          case "recent":
            showFavorites = false; currentFolder = null;
            links.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)); break;
          default:
            showFavorites = false; currentFolder = null;
        }
        renderLinks();
      });
    });
  }

  function initializeFolderButtons() {
    elements.sidebarAddFolderBtn?.addEventListener("click", createFolderPrompt);
    elements.headerAddFolderBtn?.addEventListener("click", createFolderPrompt);
  }

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoLastAction();
    }
  });

  function undoLastAction() {
    if (!undoStack.length) { showToast("Nothing to undo", "error"); return; }
    const last = undoStack.pop();
    try {
      switch (last.type) {
        case "ADD_LINK": {
          const idx = links.findIndex(link => link.id === last.link.id);
          if (idx !== -1) {
            links.splice(idx, 1);
            showToast("Link addition undone");
          }
          break;
        }
        case "DELETE_LINK": {
          links.splice(last.index, 0, last.link);
          showToast("Link deletion undone");
          break;
        }
        case "EDIT_LINK": {
          const idx = links.findIndex(link => link.id === last.oldLink.id);
          if (idx !== -1) {
            links[idx] = { ...last.oldLink };
            showToast("Link modification undone");
          }
          break;
        }
        default:
          showToast("Unknown undo action type", "error");
      }
      saveLinks();
      renderLinks();
      updateSidebarBadges();
    } catch (error) {
      console.error('Error during undo:', error);
      showToast('Error during undo operation', 'error');
    }
  }

  function initializeEventListeners() {
    elements.themeToggle?.addEventListener("click", () => {
      toggleTheme();
      updateThemeButtonIcons();
    });
    elements.sidebarThemeToggle?.addEventListener("click", () => {
      toggleTheme();
      updateThemeButtonIcons();
    });
    updateThemeButtonIcons();
    if (elements.createNotebookBtn) {
      elements.createNotebookBtn.addEventListener("click", showNotebookPrompt);
    }
    if (elements.addNoteBtn) {
      elements.addNoteBtn.addEventListener("click", addNote);
    }
    if (elements.toggleDatesBtn) {
      elements.toggleDatesBtn.addEventListener("click", () => {
        showDates = !showDates;
        localStorage.setItem('showDates', showDates);
        updateDatesVisibility();
      });
      if (showDates) {
        elements.toggleDatesBtn.classList.add("active");
      }
    }
    const toggleQrBtn = document.getElementById('toggleQrBtn');
    if (toggleQrBtn) {
      if (showQrButton) {
        toggleQrBtn.classList.add('active');
      }
      toggleQrBtn.addEventListener('click', () => {
        showQrButton = !showQrButton;
        localStorage.setItem('showQrButton', showQrButton);
        toggleQrBtn.classList.toggle('active');
        document.querySelectorAll('.qr-btn').forEach(btn => {
          btn.style.display = showQrButton ? 'flex' : 'none';
        });
        showToast(showQrButton ? 'QR buttons enabled' : 'QR buttons disabled');
      });
    }
    const togglePreviewBtn = document.getElementById('togglePreviewBtn');
    if (togglePreviewBtn) {
      if (showPreviewButton) {
        togglePreviewBtn.classList.add('active');
      }
      togglePreviewBtn.addEventListener('click', () => {
        showPreviewButton = !showPreviewButton;
        localStorage.setItem('showPreviewButton', showPreviewButton);
        togglePreviewBtn.classList.toggle('active');
        document.querySelectorAll('.preview-btn').forEach(btn => {
          btn.style.display = showPreviewButton ? 'flex' : 'none';
        });
        showToast(showPreviewButton ? 'Preview buttons enabled' : 'Preview buttons disabled');
      });
    }
    initializeSidebar();
    initializeFolderButtons();
    initializeSidebarEvents();
    elements.sidebarCollapseBtn?.addEventListener("click", toggleSidebar);
    renderFolders();
    renderLinks();
    renderNotebooks();
    renderSelectedNote();
    updateDatesVisibility();
  }

  initializeEventListeners();

  if (elements.toggleNotesBtn) {
    elements.toggleNotesBtn.addEventListener("click", () => {
      if (!elements.notesPanel || !elements.mainContainer) return;
      const isOpen = elements.notesPanel.classList.contains("open");
      elements.notesPanel.classList.toggle("open", !isOpen);
      elements.mainContainer.classList.toggle("notes-open", !isOpen);
    });
  }
  if (elements.closeNotesBtn) {
    elements.closeNotesBtn.addEventListener("click", () => {
      if (!elements.notesPanel || !elements.mainContainer) return;
      elements.notesPanel.classList.remove("open");
      elements.mainContainer.classList.remove("notes-open");
    });
  }
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 768 && elements.notesPanel.classList.contains("open")) {
      elements.notesPanel.classList.remove("open");
      elements.mainContainer.classList.remove("notes-open");
    }
  });

  async function deleteLink(linkId) {
    try {
      const linkIndex = links.findIndex(link => link.id === linkId);
      if (linkIndex === -1) throw new Error("Link not found");
      const deleted = { ...links[linkIndex] };
      const { error } = await supabase.from('links').delete().eq('id', linkId).eq('user_id', currentUserId);
      if (error) throw error;
      links.splice(linkIndex, 1);
      undoStack.push({ type: "DELETE_LINK", link: deleted, index: linkIndex });
      renderLinks();
      updateSidebarBadges();
      showToast("Link deleted successfully");
    } catch (error) {
      console.error('Error deleting link:', error);
      showToast('Error deleting link', 'error');
    }
  }

  async function handleNoteDelete(notebookId, noteId) {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', noteId).eq('user_id', currentUserId);
      if (error) throw error;
      const notebook = notebooks.find(nb => nb.id === notebookId);
      if (notebook) {
        notebook.notes = notebook.notes.filter(n => n.id !== noteId);
        if (currentNoteId === noteId) currentNoteId = null;
        renderNotebooks();
        renderSelectedNote();
        showToast("Note deleted successfully");
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      showToast('Error deleting note', 'error');
    }
  }

  async function handleNotebookDelete(notebookId) {
    if (!confirm("Are you sure you want to delete this notebook and all its notes?")) return;
    try {
      const { error: notesError } = await supabase.from('notes').delete().eq('notebook_id', notebookId).eq('user_id', currentUserId);
      if (notesError) throw notesError;
      const { error: nbError } = await supabase.from('notebooks').delete().eq('id', notebookId).eq('user_id', currentUserId);
      if (nbError) throw nbError;
      notebooks = notebooks.filter(nb => nb.id !== notebookId);
      if (currentNotebookId === notebookId) { currentNotebookId = null; currentNoteId = null; }
      renderNotebooks();
      renderSelectedNote();
      showToast("Notebook deleted successfully");
    } catch (error) {
      console.error('Error deleting notebook:', error);
      showToast("Notebook deleted successfully");
    }
  }

  async function handleNotebookRename(notebookId) {
    const notebook = notebooks.find(nb => nb.id === notebookId);
    if (!notebook) return;
    if (document.querySelector('.folder-rename-input')) {
      return;
    }
    let isProcessing = false;
    const oldName = notebook.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-rename-input';
    input.value = oldName;
    input.maxLength = 30;
    const nameSpan = document.querySelector(`.notebook-title-left[data-id="${notebookId}"] .notebook-name`);
    if (!nameSpan) return;
    const finishRenaming = async (save = false) => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        const newName = input.value.trim();
        if (save && newName && newName !== oldName) {
          const { error } = await supabase
            .from('notebooks')
            .update({ name: newName })
            .eq('id', notebookId)
            .eq('user_id', currentUserId);
          if (error) throw error;
          notebook.name = newName;
        } else {
          notebook.name = oldName;
        }
      } catch (error) {
        console.error('Error renaming notebook:', error);
        showToast('Error renaming notebook', 'error');
        notebook.name = oldName;
      } finally {
        if (input && !input.isConnected) return;
        input.removeEventListener('blur', handleBlur);
        input.removeEventListener('keydown', handleKeyDown);
        renderNotebooks();
        isProcessing = false;
      }
    };
    const handleBlur = () => finishRenaming(true);
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRenaming(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishRenaming(false);
      }
    };
    nameSpan.style.display = 'none';
    nameSpan.parentNode.insertBefore(input, nameSpan);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
});

function initializeApp() {
  // Optionnel : toute initialisation globale supplémentaire
}

initializeApp();

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function updateDatesVisibility() {
  const dateElements = document.querySelectorAll(".link-date");
  const toggleBtn = document.getElementById("toggleDatesBtn");
  dateElements.forEach(el => {
    el.style.display = showDates ? "block" : "none";
  });
  if (toggleBtn) {
    if (showDates) {
      toggleBtn.classList.add("active");
    } else {
      toggleBtn.classList.remove("active");
    }
  }
}

let currentPreviewUrl = null;

function showPreview(url) {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('previewFrame');
  const loading = document.getElementById('previewLoading');
  const title = modal.querySelector('.preview-title');
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  currentPreviewUrl = url;
  modal.classList.add('active');
  title.textContent = `Preview: ${new URL(url).hostname}`;
  frame.src = '';
  loading.style.display = 'flex';
  frame.onerror = () => {
    loading.style.display = 'none';
    frame.style.display = 'none';
    const errorContainer = document.querySelector('.preview-error') || document.createElement('div');
    errorContainer.className = 'preview-error';
    errorContainer.innerHTML = `
          <i class="fas fa-exclamation-circle"></i>
          <p>Unable to load preview</p>
          <a href="${url}" target="_blank" class="btn btn-primary" style="margin-top: 1rem;">
              Open in new tab
          </a>
      `;
    frame.parentNode.appendChild(errorContainer);
  };
  frame.onload = () => {
    loading.style.display = 'none';
    frame.style.display = 'block';
    const errorContainer = document.querySelector('.preview-error');
    if (errorContainer) {
      errorContainer.remove();
    }
  };
  frame.src = proxyUrl;
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('previewModal');
  const closePreviewBtn = document.getElementById('closePreview');
  const openInNewTabBtn = document.getElementById('openInNewTab');
  closePreviewBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
    const frame = document.getElementById('previewFrame');
    frame.src = '';
    const errorContainer = document.querySelector('.preview-error');
    if (errorContainer) {
      errorContainer.remove();
    }
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      const frame = document.getElementById('previewFrame');
      frame.src = '';
      const errorContainer = document.querySelector('.preview-error');
      if (errorContainer) {
        errorContainer.remove();
      }
    }
  });
  openInNewTabBtn?.addEventListener('click', () => {
    if (currentPreviewUrl) {
      window.open(currentPreviewUrl, '_blank');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
      const frame = document.getElementById('previewFrame');
      frame.src = '';
      const errorContainer = document.querySelector('.preview-error');
      if (errorContainer) {
        errorContainer.remove();
      }
    }
  });
});

let currentQrUrl = null;

function showQrCode(url) {
  const modal = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrcode');
  const urlText = modal.querySelector('.qr-url');
  qrContainer.innerHTML = '';
  currentQrUrl = url;
  new QRCode(qrContainer, {
    text: url,
    width: 256,
    height: 256,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  urlText.textContent = url;
  modal.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('qrModal');
  const closeBtn = document.getElementById('closeQrModal');
  const downloadBtn = document.getElementById('downloadQr');
  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
  downloadBtn?.addEventListener('click', () => {
    if (!currentQrUrl) return;
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${new URL(currentQrUrl).hostname}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
});

const previewCache = new Map();
let isPreloading = false;

async function preloadPreview(url) {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    const html = await response.text();
    previewCache.set(url, html);
    return true;
  } catch (error) {
    console.warn(`Failed to preload ${url}:`, error);
    return false;
  }
}

async function preloadAllPreviews() {
  const preloadProgress = document.querySelector('.preload-progress');
  const togglePreloadBtn = document.getElementById('togglePreloadBtn');
  if (isPreloading) {
    isPreloading = false;
    togglePreloadBtn.classList.remove('active');
    preloadProgress.hidden = true;
    return;
  }
  isPreloading = true;
  togglePreloadBtn.classList.add('active');
  preloadProgress.hidden = false;
  const urlsToPreload = links.map(link => link.url);
  let loaded = 0;
  preloadProgress.style.width = '0%';
  for (const url of urlsToPreload) {
    if (!isPreloading) break;
    if (!previewCache.has(url)) {
      await preloadPreview(url);
    }
    loaded++;
    const progress = (loaded / urlsToPreload.length) * 100;
    preloadProgress.style.width = `${progress}%`;
  }
  if (isPreloading) {
    showToast(`Préchargement terminé: ${loaded} pages`);
    isPreloading = false;
    togglePreloadBtn.classList.remove('active');
    preloadProgress.hidden = true;
  }
}

function showPreview(url) {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('previewFrame');
  const loading = document.getElementById('previewLoading');
  const title = modal.querySelector('.preview-title');
  currentPreviewUrl = url;
  modal.classList.add('active');
  title.textContent = `Preview: ${new URL(url).hostname}`;
  frame.src = '';
  loading.style.display = 'flex';
  const displayPreview = (content) => {
    const blob = new Blob([content], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    frame.onload = () => {
      loading.style.display = 'none';
      frame.style.display = 'block';
      URL.revokeObjectURL(blobUrl);
    };
    frame.onerror = () => {
      loading.style.display = 'none';
      handlePreviewError(frame, url);
    };
    frame.src = blobUrl;
  };
  if (previewCache.has(url)) {
    displayPreview(previewCache.get(url));
  } else {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    fetch(proxyUrl)
      .then(response => response.text())
      .then(html => {
        previewCache.set(url, html);
        displayPreview(html);
      })
      .catch(() => handlePreviewError(frame, url));
  }
}

function handlePreviewError(frame, url) {
  frame.style.display = 'none';
  const errorContainer = document.querySelector('.preview-error') || document.createElement('div');
  errorContainer.className = 'preview-error';
  errorContainer.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <p>Unable to load preview</p>
        <a href="${url}" target="_blank" class="btn btn-primary" style="margin-top: 1rem;">
            Open in new tab
        </a>
    `;
  frame.parentNode.appendChild(errorContainer);
}

document.addEventListener('DOMContentLoaded', () => {
  const togglePreloadBtn = document.getElementById('togglePreloadBtn');
  if (togglePreloadBtn) {
    togglePreloadBtn.addEventListener('click', preloadAllPreviews);
  }
});
