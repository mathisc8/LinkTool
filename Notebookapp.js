/****************************
 * Configuration Supabase
 ****************************/
const supabaseUrl = "https://qnqkizhwtwsptqnayfpd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucWtpemh3dHdzcHRxbmF5ZnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4NTE3ODYsImV4cCI6MjA1MjQyNzc4Nn0.oP5hXVIo1bAGLCYcqEOIEpyFZNhaQ43eNsvU9i_Qq6Q";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

/****************************
 * State global
 ****************************/
let selectedNotebookId = null;
let selectedNoteId = null;
let selectedPageId = null;
let editMode = null; // "note" ou "page"
let currentUserId = null;
let currentNotes = [];
let favorites = [];

// Ajouter ces variables avec les autres variables globales
let lastVersionSave = Date.now();
let versionSaveInterval = null;

/****************************
 * Au chargement : initialisation
 ****************************/
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Vérifier l'authentification (exemple)
    await checkAuth();

    // 2. Initialiser le thème
    initTheme();

    // 3. Charger la liste des Notebooks
    await loadNotebooks();

    // 4. Auto-sauvegarde
    setupAutoSave();

    // 5. Toggle du thème
    document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

    // 6. Afficher "No selection" au départ
    showEmptyState(true);

    // 7. Écouteurs sur les boutons de format
    document.querySelectorAll(".format-btn").forEach((btn) => {
        const format = btn.dataset.format;
        if (format && !["insertImage", "highlight"].includes(format)) {
            btn.addEventListener("click", () => {
                applyFormat(format);
            });
        }
    });

    // 8. Gestion de l’upload image
    setupImageHandling();

    // 9. Mise à jour de l’état des boutons de format + compteur mots
    const editorContent = document.getElementById("editorContent");
    if (editorContent) {
        editorContent.addEventListener("keyup", () => {
            updateFormatButtonStates();
            updateWordCount();
        });
        editorContent.addEventListener("mouseup", updateFormatButtonStates);
        editorContent.addEventListener("scroll", updateScrollProgress);
    }

    // 9bis. Boutons couleur
    setupFormatButtons();

    // 10. Installation de la recherche
    setupSearchHandler();

    // 11. Favoris
    loadFavorites();

    // 12. Export PDF
    const exportPdfBtn = document.getElementById("exportPdfBtn");
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener("click", exportToPDF);
    }

    // 13. Mode plein écran
    const toggleFullscreenBtn = document.getElementById("toggleFullscreen");
    if (toggleFullscreenBtn) {
        toggleFullscreenBtn.addEventListener("click", toggleFullscreen);
    }

    // 14. Gérer le collapse des sidebars
    document.getElementById("toggleLeftSidebarBtn")?.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.toggle("collapsed");
    });
    document.getElementById("toggleRightSidebarBtn")?.addEventListener("click", () => {
        document.getElementById("favoritesSidebar")?.classList.toggle("collapsed");
    });

    // 15. Historique des versions (sidebar)
    document.getElementById("toggleHistorySidebarBtn")?.addEventListener("click", () => {
        document.getElementById("historySidebar").classList.add("open");
        loadHistory();
    });
    document.getElementById("closeHistorySidebarBtn")?.addEventListener("click", () => {
        document.getElementById("historySidebar").classList.remove("open");
    });

    const todoSidebar = document.getElementById('todoSidebar');
    const toggleTodoSidebarBtn = document.getElementById('toggleTodoSidebar');
    const closeTodoSidebarBtn = document.getElementById('closeTodoSidebarBtn');

    const addTodoBtn = document.getElementById('addTodoBtn');
    const clearCompletedBtn = document.getElementById('clearCompletedBtn');
    const archiveCompletedBtn = document.getElementById('ArchiveCompletedBtn');



    const projectFilter = document.getElementById('projectFilter');
    const todoFilter = document.getElementById('todoFilter');
    const dueDateFilter = document.getElementById('dueDateFilter');
    const todoSearchInput = document.getElementById('todoSearchInput');

    // Ouvrir la sidebar
    toggleTodoSidebarBtn.addEventListener('click', () => {
        todoSidebar.classList.add('open');
        // Chargement des projets pour le filtre
        loadProjectOptions();
    });

    // Fermer la sidebar
    closeTodoSidebarBtn.addEventListener('click', () => {
        todoSidebar.classList.remove('open');
    });

    // Ajouter une nouvelle tâche
    addTodoBtn.addEventListener('click', () => {
        addTodo();
    });

    // Effacer les tâches terminées
    clearCompletedBtn.addEventListener('click', async () => {
        if (confirm('Êtes-vous sûr de vouloir supprimer toutes les tâches terminées ?')) {
            await clearCompletedTodos();
            await loadTodos();
        }
    });

    archiveCompletedBtn.addEventListener('click', async () => {
        if (confirm('Êtes-vous sûr de vouloir archiver toutes les tâches terminées ?')) {
            await ArchiveCompletedBtn();
            await loadTodos();
        }
    });

    // Filtres
    projectFilter.addEventListener('change', () => loadTodos());
    todoFilter.addEventListener('change', () => loadTodos());
    dueDateFilter.addEventListener('change', () => loadTodos());
    todoSearchInput.addEventListener('input', () => loadTodos());

    // Chargement initial
    loadTodos();
});

/****************************
 * Vérification de l'authentification (exemple)
 ****************************/
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
/****************************
 * Gestion du thème
 ****************************/
function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
}
function updateThemeIcon(theme) {
    const icon = document.querySelector(".selectTheme i");
    if (icon) {
        icon.className = theme === "dark" ? "fas fa-moon" : "fas fa-sun";
    }
}

/****************************
 * 1) GESTION DES NOTEBOOKS
 ****************************/
async function loadNotebooks() {
    try {
        const { data, error } = await supabase
            .from("notebooks")
            .select("*")
            .eq("user_id", currentUserId)
            .order("name", { ascending: true });

        if (error) {
            console.warn("Table notebooks indisponible ou pas encore créée.");
        }
        const listDiv = document.getElementById("notebooksList");
        if (!listDiv) return;
        listDiv.innerHTML = "";

        const notebooks = data || [];
        notebooks.forEach((notebook) => {
            const notebookEl = document.createElement("div");
            notebookEl.className = "notebook-item";

            notebookEl.innerHTML = `
            <div class="notebook-title ${notebook.id === selectedNotebookId ? "active" : ""}" data-notebook-id="${notebook.id}">
              <div class="notebook-title-left">
                <i class="fas ${notebook.id === selectedNotebookId ? "fa-book-open" : "fa-book"}"></i>
                <span class="notebook-name">${notebook.name}</span>
              </div>
              <div class="notebook-actions">
                <!-- Changer fas en far pour avoir une étoile vide par défaut -->
                <button class="action-btn favorite-btn" title="Mettre en Favori">
                  <i class="far fa-star"></i>
                </button>
                <button class="action-btn edit-btn" title="Renommer">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete-btn" title="Supprimer">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `;

            // Clic sur le titre => sélection du Notebook
            notebookEl
                .querySelector(".notebook-title")
                .addEventListener("click", () => {
                    selectNotebook(notebook.id);
                });

            // Bouton "Favori"
            notebookEl
                .querySelector("[title='Mettre en Favori']")
                .addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggleFavoriteNotebook(notebook);
                });
            // Bouton "edit" (renommer)
            notebookEl
                .querySelector(".edit-btn")
                .addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const newName = prompt("Nouveau nom du Notebook :", notebook.name);
                    if (newName && newName.trim() !== "") {
                        await renameNotebook(notebook.id, newName.trim());
                    }
                });

            // Bouton "delete"
            notebookEl
                .querySelector(".delete-btn")
                .addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (
                        confirm(
                            `Voulez-vous vraiment supprimer le Notebook "${notebook.name}" ?`
                        )
                    ) {
                        await deleteNotebook(notebook.id);
                    }
                });

            listDiv.appendChild(notebookEl);
        });

        // Recharger ses notes
        if (selectedNotebookId) {
            await loadNotes(selectedNotebookId);
        }
    } catch (err) {
        console.error("Erreur loadNotebooks:", err.message);
    }
}
function selectNotebook(notebookId) {
    document.querySelectorAll(".notebook-title").forEach((el) => {
        el.classList.remove("active");
        const icon = el.querySelector("i");
        if (icon) icon.className = "fas fa-book";
    });

    const selectedTitle = document.querySelector(
        `.notebook-title[data-notebook-id="${notebookId}"]`
    );
    if (selectedTitle) {
        selectedTitle.classList.add("active");
        const icon = selectedTitle.querySelector("i");
        if (icon) icon.className = "fas fa-book-open";
    }

    selectedNotebookId = notebookId;
    selectedNoteId = null;
    selectedPageId = null;

    loadNotes(notebookId);
    loadPages(null);

    updateHierarchyPath();
    showEmptyState(true);
}
async function createNotebook() {
    const name = prompt("Nom du Notebook :");
    if (!name) return;
    try {
        const newNotebook = {
            id: crypto.randomUUID(),
            name,
            user_id: currentUserId,
        };
        const { error } = await supabase.from("notebooks").insert([newNotebook]);
        if (error) throw error;
        await loadNotebooks();
    } catch (err) {
        console.error("Erreur createNotebook:", err.message);
    }
}
async function renameNotebook(notebookId, newName) {
    try {
        const { error } = await supabase
            .from("notebooks")
            .update({ name: newName })
            .eq("id", notebookId);
        if (error) throw error;
        await loadNotebooks();
    } catch (err) {
        console.error("Erreur renameNotebook:", err.message);
    }
}
async function deleteNotebook(notebookId) {
    try {
        const { error } = await supabase
            .from("notebooks")
            .delete()
            .eq("id", notebookId);
        if (error) throw error;
        if (notebookId === selectedNotebookId) {
            selectedNotebookId = null;
            selectedNoteId = null;
            selectedPageId = null;
            clearEditor();
        }
        await loadNotebooks();
    } catch (err) {
        console.error("Erreur deleteNotebook:", err.message);
    }
}

/****************************
 * 2) GESTION DES NOTES
 ****************************/
async function loadNotes(notebookId) {
    const notesListDiv = document.getElementById("notesList");
    if (!notesListDiv) return;
    try {
        const { data, error } = await supabase
            .from("notes")
            .select("*")
            .eq("notebook_id", notebookId)
            .eq("user_id", currentUserId)
            .order("last_modified", { ascending: false });

        if (error) {
            console.warn("Table notes indisponible ou pas encore créée.");
        }
        currentNotes = data || [];
        notesListDiv.innerHTML = "";

        if (currentNotes.length === 0) {
            notesListDiv.innerHTML = `
            <div class="empty-state"
                style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
                <i class="fas fa-file-alt"></i>
                <p>Aucune note dans ce notebook</p>
            </div>
          `;
            return;
        }
        const ul = document.createElement("ul");
        ul.className = "item-list";
        notesListDiv.appendChild(ul);

        currentNotes.forEach((note) => {
            const li = document.createElement("li");
            li.className = note.id === selectedNoteId ? "active" : "";
            li.dataset.noteId = note.id;
            li.innerHTML = `
            <div class="note-content">
              <span class="note-title">${note.title || "(Sans titre)"}</span>
            </div>
            <div class="actions">
              <!-- Changer fas en far pour avoir une étoile vide par défaut -->
              <button class="action-btn favorite-btn" title="Favori" onclick="toggleFavoriteNote(event, '${note.id}')">
                <i class="far fa-star"></i>
              </button>
              <button class="action-btn delete-btn" title="Supprimer">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `;
            // Clic sur la note => sélection
            li.addEventListener("click", (e) => {
                if (
                    !e.target.closest(".delete-btn") &&
                    !e.target.closest(".action-btn[title='Favori']")
                ) {
                    selectNote(note.id);
                }
            });
            // Bouton "Supprimer"
            li.querySelector(".delete-btn").addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm("Voulez-vous vraiment supprimer cette note ?")) {
                    await deleteNote(note.id);
                }
            });
            ul.appendChild(li);
        });
    } catch (err) {
        console.error("Erreur loadNotes:", err.message);
    }
}
function selectNote(noteId) {
    const note = currentNotes.find((n) => n.id === noteId);
    if (!note) return;

    document.querySelectorAll("#notesList li").forEach((li) => {
        li.classList.toggle("active", li.dataset.noteId === noteId);
    });

    selectedNoteId = noteId;
    selectedPageId = null;
    editMode = "note";

    showInEditor(note.title, note.content);
    loadPages(noteId);

    updateHierarchyPath();
    showEmptyState(false);
    lastSavedContent = '';
    lastSavedTitle = '';
    lastVersionSave = Date.now();
}
async function createNote() {
    if (!selectedNotebookId) {
        alert("Sélectionnez d'abord un Notebook !");
        return;
    }
    const title = prompt("Titre de la Note :");
    if (title === null) return;
    const now = new Date().toISOString();
    const newNote = {
        id: crypto.randomUUID(),
        notebook_id: selectedNotebookId,
        title,
        content: "",
        date_created: now,
        last_modified: now,
        user_id: currentUserId,
    };
    try {
        const { error } = await supabase.from("notes").insert([newNote]);
        if (error) throw error;
        await loadNotes(selectedNotebookId);
    } catch (err) {
        console.error("Erreur createNote:", err.message);
    }
}
async function deleteNote(noteId) {
    try {
        const { error } = await supabase.from("notes").delete().eq("id", noteId);
        if (error) throw error;
        if (selectedNoteId === noteId) {
            selectedNoteId = null;
            clearEditor();
        }
        await loadNotes(selectedNotebookId);
    } catch (err) {
        console.error("Erreur deleteNote:", err.message);
    }
}

/****************************
 * 3) GESTION DES PAGES
 ****************************/
async function loadPages(noteId) {
    const pagesListDiv = document.getElementById("pagesList");
    if (!pagesListDiv) return;

    if (!noteId) {
        pagesListDiv.innerHTML = `
          <div class="empty-state"
              style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
              <i class="fas fa-file-alt"></i>
              <p>Sélectionnez une note pour voir ses pages</p>
          </div>
        `;
        return;
    }
    try {
        const { data, error } = await supabase
            .from("pages")
            .select("*")
            .eq("note_id", noteId)
            .eq("user_id", currentUserId)
            .order("last_modified", { ascending: false });

        if (error) {
            console.warn("Table pages indisponible ou pas encore créée.");
        }
        pagesListDiv.innerHTML = "";
        const pages = data || [];
        if (!pages.length) {
            pagesListDiv.innerHTML = `
            <div class="empty-state"
                style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
                <i class="fas fa-file-alt"></i>
                <p>Aucune page dans cette note</p>
            </div>
          `;
            return;
        }
        const ul = document.createElement("ul");
        ul.className = "item-list";
        pages.forEach((page) => {
            const li = document.createElement("li");
            li.className = page.id === selectedPageId ? "active" : "";
            li.dataset.pageId = page.id;
            li.innerHTML = `
            <div class="page-content">
              <span class="page-title">${page.title || "(Sans titre)"}</span>
            </div>
            <div class="actions">
              <button class="action-btn" title="Supprimer">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `;
            // Sélectionner la page
            li.addEventListener("click", (e) => {
                if (!e.target.closest(".action-btn")) {
                    selectPage(page);
                }
            });
            // Supprimer la page
            li.querySelector(".action-btn").addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm("Voulez-vous vraiment supprimer cette page ?")) {
                    await deletePage(page.id);
                }
            });
            ul.appendChild(li);
        });
        pagesListDiv.appendChild(ul);
    } catch (err) {
        console.error("Erreur loadPages:", err.message);
    }
}
function selectPage(page) {
    selectedPageId = page.id;
    editMode = "page";
    document.querySelectorAll("#pagesList li").forEach((li) => {
        li.classList.toggle("active", li.dataset.pageId === page.id);
    });
    showInEditor(page.title, page.content || "");
    updateHierarchyPath();
    showEmptyState(false);
    lastSavedContent = '';
    lastSavedTitle = '';
    lastVersionSave = Date.now();
}
async function createPage() {
    if (!selectedNoteId) {
        alert("Sélectionnez d'abord une Note !");
        return;
    }
    const title = prompt("Titre de la Page :");
    if (title === null) return;
    const now = new Date().toISOString();
    const newPage = {
        id: crypto.randomUUID(),
        note_id: selectedNoteId,
        title,
        content: "",
        date_created: now,
        last_modified: now,
        user_id: currentUserId,
    };
    try {
        const { data, error } = await supabase
            .from("pages")
            .insert([newPage])
            .select()
            .single();
        if (error) throw error;
        await loadPages(selectedNoteId);
        if (data) {
            selectPage(data);
        }
    } catch (err) {
        console.error("Erreur createPage:", err.message);
    }
}
async function deletePage(pageId) {
    try {
        const { error } = await supabase.from("pages").delete().eq("id", pageId);
        if (error) throw error;
        if (selectedPageId === pageId) {
            selectedPageId = null;
            clearEditor();
        }
        await loadPages(selectedNoteId);
    } catch (err) {
        console.error("Erreur deletePage:", err.message);
    }
}

/****************************
 * 4) ÉDITEUR (Note ou Page)
 ****************************/
function showInEditor(title, content) {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");
    const editorPanel = document.getElementById("editorPanel");
    if (editorTitle && editorContent) {
        editorTitle.textContent = title || "";
        if (content) {
            const sanitizedContent = DOMPurify.sanitize(content, {
                ALLOWED_TAGS: [
                    "div", "br", "p", "strong", "em", "u", "h1", "h2", "h3",
                    "ul", "ol", "li", "img", "span", "blockquote", "code", "pre",
                    "table", "tr", "td", "th", "thead", "tbody", "input"
                ],
                ALLOWED_ATTR: ["src", "alt", "style", "class", "data-*", "border", "type", "checked"],
            });
            editorContent.innerHTML = sanitizedContent;

            // Réattacher les listeners
            editorContent.querySelectorAll(".image-wrapper").forEach((wrapper) => {
                attachImageListeners(wrapper);
            });
        } else {
            editorContent.innerHTML = "";
        }
        // Scroll infini
        if (editorPanel) {
            setupInfiniteScroll(editorPanel, editorContent);
        }
        editorTitle.contentEditable = "true";
        editorContent.contentEditable = "true";
    }
    updateWordCount();
    updateScrollProgress();

    // Restaurer l'état des checkboxes
    editorContent.querySelectorAll('.checkbox-item').forEach(item => {
        const checkbox = item.querySelector('.task-checkbox');
        const content = item.querySelector('.checkbox-content');
        if (checkbox && content) {
            checkbox.addEventListener('change', () => {
                content.classList.toggle('completed', checkbox.checked);
                saveCurrent();
            });
        }
    });
}
function setupInfiniteScroll(panel, content) {
    let isScrolling = false;
    const scrollThreshold = 100;
    panel.addEventListener("scroll", () => {
        if (isScrolling) return;
        const scrollPosition = panel.scrollTop + panel.offsetHeight;
        const scrollHeight = panel.scrollHeight;
        if (scrollHeight - scrollPosition < scrollThreshold) {
            isScrolling = true;
            content.style.paddingBottom =
                parseInt(getComputedStyle(content).paddingBottom) + 50 + "vh";
            setTimeout(() => {
                isScrolling = false;
            }, 100);
        }
    });
    panel.addEventListener("scroll", () => {
        if (panel.scrollTop === 0) {
            content.style.paddingBottom = "50vh";
        }
    });
}
async function saveCurrent(forceVersionSave = false) {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");
    if (!editorTitle || !editorContent) return;

    const newTitle = editorTitle.textContent.trim();
    const newContent = editorContent.innerHTML.trim();
    const now = new Date().toISOString();

    try {
        if (editMode === "note" && selectedNoteId) {
            const { error } = await supabase
                .from("notes")
                .update({
                    title: newTitle,
                    content: newContent,
                    last_modified: now,
                })
                .eq("id", selectedNoteId)
                .eq("user_id", currentUserId);
            if (error) throw error;

            // Sauvegarder la version seulement si forcé
            if (forceVersionSave) {
                await saveVersion("note", selectedNoteId, newTitle, newContent);
            }

            await loadNotes(selectedNotebookId);
        } else if (editMode === "page" && selectedPageId) {
            const { error } = await supabase
                .from("pages")
                .update({
                    title: newTitle,
                    content: newContent,
                    last_modified: now,
                })
                .eq("id", selectedPageId)
                .eq("user_id", currentUserId);
            if (error) throw error;

            // Sauvegarder la version seulement si forcé
            if (forceVersionSave) {
                await saveVersion("page", selectedPageId, newTitle, newContent);
            }

            await loadPages(selectedNoteId);
        }
    } catch (err) {
        console.error("Erreur saveCurrent:", err.message);
        showToast("Erreur lors de la sauvegarde", "error");
    }
}
function clearEditor() {
    editMode = null;
    selectedNoteId = null;
    selectedPageId = null;
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");
    if (editorTitle) editorTitle.textContent = "";
    if (editorContent) editorContent.textContent = "";
    updateHierarchyPath();
    showEmptyState(true);
    updateWordCount();
}

/****************************
 * 5) AFFICHAGE DU CHEMIN (breadcrumb)
 ****************************/
async function updateHierarchyPath() {
    const pathDiv = document.getElementById("hierarchyPath");
    if (!pathDiv) return;
    pathDiv.innerHTML = "";
    const createPathElement = (text, type) => {
        const span = document.createElement("span");
        span.className = `${type}-path`;
        span.textContent = text;
        return span;
    };
    try {
        // Notebook
        if (selectedNotebookId) {
            const { data: notebook } = await supabase
                .from("notebooks")
                .select("name")
                .eq("id", selectedNotebookId)
                .single();
            pathDiv.appendChild(
                createPathElement(notebook?.name || "Notebook", "notebook")
            );
        }
        // Note
        if (selectedNoteId) {
            const { data: note } = await supabase
                .from("notes")
                .select("title")
                .eq("id", selectedNoteId)
                .single();
            pathDiv.appendChild(createPathElement(note?.title || "Note", "note"));
        }
        // Page
        if (selectedPageId) {
            const { data: page } = await supabase
                .from("pages")
                .select("title")
                .eq("id", selectedPageId)
                .single();
            pathDiv.appendChild(createPathElement(page?.title || "Page", "page"));
        }
    } catch (error) {
        console.error("Erreur updateHierarchyPath:", error);
    }
}

/****************************
 * 6) AUTO-SAUVEGARDE
 ****************************/
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
// Remplacer la fonction setupAutoSave existante par celle-ci
function setupAutoSave() {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    // Auto-sauvegarde normale (debounced)
    const autoSave = debounce(async () => {
        if (editMode && (selectedNoteId || selectedPageId)) {
            await saveCurrent(false); // false = ne pas forcer la sauvegarde de version
        }
    }, 1000);

    // Configuration de la sauvegarde périodique des versions
    const setupVersionSaving = () => {
        // Arrêter l'intervalle existant s'il y en a un
        if (versionSaveInterval) {
            clearInterval(versionSaveInterval);
        }

        // Créer un nouvel intervalle de 30 secondes
        versionSaveInterval = setInterval(async () => {
            if (editMode && (selectedNoteId || selectedPageId)) {
                const currentContent = editorContent.innerHTML;
                const currentTitle = editorTitle.textContent;

                // Vérifier si le contenu a changé depuis la dernière sauvegarde de version
                if (hasContentChanged(currentTitle, currentContent)) {
                    await saveCurrent(true); // true = forcer la sauvegarde de version
                    lastVersionSave = Date.now();
                }
            }
        }, 30000); // 30 secondes
    };

    // Démarrer la sauvegarde périodique
    setupVersionSaving();

    // Ajouter les écouteurs d'événements
    if (editorTitle) {
        editorTitle.addEventListener("input", autoSave);
    }
    if (editorContent) {
        editorContent.addEventListener("input", autoSave);
    }

    // Nettoyer l'intervalle quand l'utilisateur quitte la page
    window.addEventListener('beforeunload', () => {
        if (versionSaveInterval) {
            clearInterval(versionSaveInterval);
        }
    });
}

// Ajouter cette nouvelle fonction pour vérifier les changements
let lastSavedContent = '';
let lastSavedTitle = '';

function hasContentChanged(newTitle, newContent) {
    if (newTitle !== lastSavedTitle || newContent !== lastSavedContent) {
        lastSavedTitle = newTitle;
        lastSavedContent = newContent;
        return true;
    }
    return false;
}

/****************************
 * 7) ÉTAT VIDE (empty state)
 ****************************/
function showEmptyState(show) {
    const emptyStateDiv = document.getElementById("emptyState");
    const editorPanel = document.getElementById("editorPanel");
    if (!emptyStateDiv || !editorPanel) return;
    if (show) {
        emptyStateDiv.style.opacity = 1;
        emptyStateDiv.style.pointerEvents = "auto";
        editorPanel.style.opacity = 0.3;
        editorPanel.style.pointerEvents = "none";
    } else {
        emptyStateDiv.style.opacity = 0;
        emptyStateDiv.style.pointerEvents = "none";
        editorPanel.style.opacity = 1;
        editorPanel.style.pointerEvents = "auto";
    }
}

/****************************
 * 8) FORMATAGE DU TEXTE
 ****************************/
function applyFormat(command, value = null) {
    switch (command) {
        case "h1":
            document.execCommand("formatBlock", false, "H1");
            break;
        case "h2":
            document.execCommand("formatBlock", false, "H2");
            break;
        case "h3":
            document.execCommand("formatBlock", false, "H3");
            break;
        case "insertCheckList":
            document.execCommand(
                "insertHTML",
                false,
                '<ul><li><input type="checkbox" /> Tâche</li></ul>'
            );
            break;
        case "insertCode":
            document.execCommand(
                "insertHTML",
                false,
                "<pre><code>// votre code ici</code></pre>"
            );
            break;
        case "insertTable":
            document.execCommand(
                "insertHTML",
                false,
                "<table border='1' style='border-collapse: collapse'><tr><td>Cell1</td><td>Cell2</td></tr><tr><td>Cell3'></td><td>Cell4'></td></tr></table>"
            );
            break;
        case "highlight":
            document.execCommand("backColor", false, "#fef08a"); // jaune clair
            break;
        case "blockquote":
            document.execCommand("formatBlock", false, "BLOCKQUOTE");
            break;
        case "insertCheckbox":
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);

            // Créer un nouvel élément li avec une checkbox améliorée
            const li = document.createElement('li');
            li.className = 'checkbox-item';

            // Utiliser data-checked pour suivre l'état
            li.innerHTML = `
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="task-checkbox">
                    <span class="checkbox-content" contenteditable="true">Nouvelle tâche</span>
                </div>
            `;

            // Trouver ou créer la liste parent
            let ul = range.commonAncestorContainer;
            while (ul && ul.nodeName !== 'UL') {
                ul = ul.parentNode;
            }

            if (!ul || !ul.classList.contains('checkbox-list')) {
                ul = document.createElement('ul');
                ul.className = 'checkbox-list';
                range.insertNode(ul);
            }

            ul.appendChild(li);

            // Configurer les événements de la checkbox
            const checkbox = li.querySelector('.task-checkbox');
            const content = li.querySelector('.checkbox-content');

            checkbox.addEventListener('change', () => {
                content.classList.toggle('completed', checkbox.checked);
                saveCurrent();
            });

            // Sélectionner le texte pour édition immédiate
            const textRange = document.createRange();
            textRange.selectNodeContents(content);
            selection.removeAllRanges();
            selection.addRange(textRange);
            break;
        case "insertTOC":
            generateTableOfContents();
            break;
        default:
            // Commandes natives
            document.execCommand(command, false, value);
    }
    updateFormatButtonStates();
    saveCurrent();
}

// Ajouter un gestionnaire d'événements pour les checkbox
document.addEventListener('click', (e) => {
    if (e.target.matches('.checkbox-item input[type="checkbox"]')) {
        // Sauvegarder l'état quand une checkbox est cochée/décochée
        saveCurrent();
    }
});

function updateFormatButtonStates() {
    document.querySelectorAll(".format-btn").forEach((btn) => {
        const format = btn.dataset.format;
        if (["bold", "italic", "underline", "strikethrough"].includes(format)) {
            btn.classList.toggle("active", document.queryCommandState(format));
        }
    });
}
function setupFormatButtons() {
    document.querySelectorAll(".format-btn").forEach((btn) => {
        const format = btn.dataset.format;
        if (format === "foreColor") {
            const colorPicker = btn.querySelector(".color-picker");
            if (colorPicker) {
                colorPicker.addEventListener("input", (e) => {
                    applyFormat("foreColor", e.target.value);
                });
                colorPicker.addEventListener("change", (e) => {
                    applyFormat("foreColor", e.target.value);
                    saveCurrent();
                });
            }
        }
    });
}

/****************************
 * 9) GESTION DES IMAGES (upload Supabase + resize)
 ****************************/
async function uploadImage(file) {
    try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${currentUserId}/${fileName}`;
        const { data, error } = await supabase.storage
            .from("notes-images")
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type,
            });
        if (error) throw error;
        const {
            data: { publicUrl },
        } = supabase.storage.from("notes-images").getPublicUrl(filePath);
        return publicUrl;
    } catch (error) {
        console.error("Erreur uploadImage:", error);
        throw error;
    }
}
function setupImageHandling() {
    let imageInput = document.getElementById("imageInput");
    if (!imageInput) {
        imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.id = "imageInput";
        imageInput.accept = "image/*";
        imageInput.style.display = "none";
        document.body.appendChild(imageInput);
    }
    const insertImageBtn = document.querySelector('[data-format="insertImage"]');
    if (insertImageBtn) {
        insertImageBtn.addEventListener("click", () => {
            imageInput.click();
        });
    }
    imageInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
            alert("Format d’image non supporté. Utilisez JPG, PNG, GIF ou WebP.");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert("L’image ne doit pas dépasser 5MB.");
            return;
        }
        const loadingIndicator = document.createElement("div");
        loadingIndicator.className = "loading-indicator";
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload en cours...';
        document.body.appendChild(loadingIndicator);
        try {
            const publicUrl = await uploadImage(file);
            if (publicUrl) {
                insertImage(publicUrl);
                await saveCurrent();
                showToast("Image uploadée avec succès", "success");
            }
        } catch (err) {
            console.error("Erreur lors de l’upload de l’image:", err);
            showToast("Erreur lors de l’upload de l’image", "error");
        } finally {
            loadingIndicator.remove();
            imageInput.value = "";
        }
    });
}
function insertImage(src) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";
    wrapper.contentEditable = "false";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Image insérée";
    img.style.maxWidth = "100%";
    wrapper.appendChild(img);
    wrapper.innerHTML += `
        <div class="image-actions">
          <button class="image-action-btn delete-img" title="Supprimer l'image">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="resize-handle" title="Redimensionner (glisser)">
          <i class="fas fa-grip-lines-vertical"></i>
        </div>
      `;
    attachImageListeners(wrapper);
    range.insertNode(wrapper);
    range.collapse(false);
    saveCurrent();
}
function attachImageListeners(wrapper) {
    const deleteBtn = wrapper.querySelector(".delete-img");
    const img = wrapper.querySelector("img");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            if (img && img.src) {
                try {
                    const fileUrl = new URL(img.src);
                    const fileName = fileUrl.pathname.split("/").pop();
                    if (fileName) {
                        // Optionnel: supprime réellement le fichier du bucket
                        await supabase.storage
                            .from("notes-images")
                            .remove([`${currentUserId}/${fileName}`]);
                    }
                    wrapper.remove();
                    saveCurrent();
                } catch (error) {
                    console.error("Erreur suppression image:", error);
                    showToast("Erreur lors de la suppression de l'image", "error");
                }
            }
        });
    }
    const resizeHandle = wrapper.querySelector(".resize-handle");
    if (resizeHandle && img) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        const doDrag = (e) => {
            if (!isResizing) return;
            const dx = e.clientX - startX;
            const newWidth = startWidth + dx;
            if (newWidth > 50) {
                img.style.width = newWidth + "px";
            }
        };
        const stopDrag = () => {
            if (isResizing) {
                isResizing = false;
                document.removeEventListener("mousemove", doDrag);
                document.removeEventListener("mouseup", stopDrag);
                saveCurrent();
            }
        };
        resizeHandle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startWidth = img.offsetWidth;
            document.addEventListener("mousemove", doDrag);
            document.addEventListener("mouseup", stopDrag);
        });
    }
    if (img) {
        // CTRL + clic pour ajuster la taille par pourcentage
        img.style.cursor = "pointer";
        img.addEventListener("click", (e) => {
            if (e.ctrlKey || e.metaKey) {
                const newSize = prompt("Entrez la largeur en % (10-100)", "100");
                if (newSize && !isNaN(newSize) && newSize >= 10 && newSize <= 100) {
                    img.style.width = `${newSize}%`;
                    saveCurrent();
                }
            }
        });
    }
}

/****************************
 * 10) GESTION DES TOASTS (exemple)
 ****************************/
function showToast(message, type = "info") {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Vous pourriez ajouter un vrai toast visuel ici
}


/****************************
 * 11) GESTION DE LA RECHERCHE
 ****************************/
function setupSearchHandler() {
    const searchInput = document.querySelector(".header-search input");
    const filterBtns = document.querySelectorAll(".search-filter-btn");
    let currentFilter = "all";
    let searchTimer = null;
    if (!searchInput) return;
    filterBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            filterBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.searchType;
            if (searchInput.value.trim() !== "") {
                performSearch(searchInput.value, currentFilter);
            } else {
                resetSearch();
            }
        });
    });
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (e.target.value.trim()) {
                performSearch(e.target.value.trim(), currentFilter);
            } else {
                resetSearch();
            }
        }, 300);
    });
}
async function performSearch(query, filter) {
    const term = query.toLowerCase();
    if (!term) {
        resetSearch();
        return;
    }
    try {
        let notebooksResult = [];
        let notesResult = [];
        let pagesResult = [];

        if (filter === "all") {
            const [nbRes, ntRes, pgRes] = await Promise.all([
                supabase
                    .from("notebooks")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .ilike("name", `%${term}%`),
                supabase
                    .from("notes")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .or(`title.ilike.%${term}%,content.ilike.%${term}%`),
                supabase
                    .from("pages")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .or(`title.ilike.%${term}%,content.ilike.%${term}%`),
            ]);
            notebooksResult = nbRes.data || [];
            notesResult = ntRes.data || [];
            pagesResult = pgRes.data || [];
        }
        if (filter === "notebooks") {
            const nbRes = await supabase
                .from("notebooks")
                .select("*")
                .eq("user_id", currentUserId)
                .ilike("name", `%${term}%`);
            notebooksResult = nbRes.data || [];
            const notebookIds = notebooksResult.map((n) => n.id);
            if (notebookIds.length) {
                const ntRes = await supabase
                    .from("notes")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .in("notebook_id", notebookIds);
                notesResult = ntRes.data || [];
                const noteIds = notesResult.map((n) => n.id);
                if (noteIds.length) {
                    const pgRes = await supabase
                        .from("pages")
                        .select("*")
                        .eq("user_id", currentUserId)
                        .in("note_id", noteIds);
                    pagesResult = pgRes.data || [];
                }
            }
        }
        if (filter === "notes") {
            const ntRes = await supabase
                .from("notes")
                .select("*")
                .eq("user_id", currentUserId)
                .or(`title.ilike.%${term}%,content.ilike.%${term}%`);
            notesResult = ntRes.data || [];
            const notebookIds = [...new Set(notesResult.map((n) => n.notebook_id))];
            if (notebookIds.length) {
                const nbRes = await supabase
                    .from("notebooks")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .in("id", notebookIds);
                notebooksResult = nbRes.data || [];
            }
            const noteIds = notesResult.map((n) => n.id);
            if (noteIds.length) {
                const pgRes = await supabase
                    .from("pages")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .in("note_id", noteIds);
                pagesResult = pgRes.data || [];
            }
        }
        if (filter === "pages") {
            const pgRes = await supabase
                .from("pages")
                .select("*")
                .eq("user_id", currentUserId)
                .or(`title.ilike.%${term}%,content.ilike.%${term}%`);
            pagesResult = pgRes.data || [];
            const noteIds = [...new Set(pagesResult.map((p) => p.note_id))];
            if (noteIds.length) {
                const ntRes = await supabase
                    .from("notes")
                    .select("*")
                    .eq("user_id", currentUserId)
                    .in("id", noteIds);
                notesResult = ntRes.data || [];
                const notebookIds = [...new Set(notesResult.map((n) => n.notebook_id))];
                if (notebookIds.length) {
                    const nbRes = await supabase
                        .from("notebooks")
                        .select("*")
                        .eq("user_id", currentUserId)
                        .in("id", notebookIds);
                    notebooksResult = nbRes.data || [];
                }
            }
        }
        displaySearchResults(notebooksResult, notesResult, pagesResult, term);
    } catch (error) {
        console.error("Erreur de recherche:", error);
        showToast("Erreur lors de la recherche", "error");
    }
}
function displaySearchResults(notebooks, notes, pages, term) {
    updateNotebooksList(notebooks, term);
    updateNotesList(notes, term);
    updatePagesList(pages, term);
}
function updateNotebooksList(notebooks, term) {
    const notebooksList = document.getElementById("notebooksList");
    if (!notebooksList) return;
    notebooksList.innerHTML = "";
    if (!notebooks.length) {
        notebooksList.innerHTML = `
          <div class="empty-state" style="position:static; height:auto;">
            <i class="fas fa-search"></i>
            <p>Aucun notebook trouvé</p>
          </div>
        `;
        return;
    }
    notebooks.forEach((nb) => {
        const notebookEl = document.createElement("div");
        notebookEl.className = "notebook-item search-result";
        notebookEl.innerHTML = `
          <div class="notebook-title" data-notebook-id="${nb.id}">
            <div class="notebook-title-left">
              <i class="fas fa-book"></i>
              <span class="notebook-name">${highlightTerm(nb.name, term)}</span>
            </div>
            <div class="notebook-actions">
              <button class="action-btn favorite-btn" title="Mettre en Favori">
                <i class="far fa-star"></i>
              </button>
            </div>
          </div>
        `;
        notebookEl
            .querySelector(".notebook-title")
            .addEventListener("click", () => {
                selectNotebook(nb.id);
            });
        notebookEl
            .querySelector(".action-btn")
            .addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFavoriteNotebook(nb);
            });
        notebooksList.appendChild(notebookEl);
    });
}
function updateNotesList(notes, term) {
    const notesList = document.getElementById("notesList");
    if (!notesList) return;
    notesList.innerHTML = "";
    if (!notes.length) {
        notesList.innerHTML = `
          <div class="empty-state" style="position:static; height:auto;">
            <i class="fas fa-search"></i>
            <p>Aucune note trouvée</p>
          </div>
        `;
        return;
    }
    const ul = document.createElement("ul");
    ul.className = "item-list";
    notesList.appendChild(ul);
    notes.forEach((note) => {
        const li = document.createElement("li");
        li.classList.add("search-result");
        li.innerHTML = `
          <div class="note-content">
            <span class="note-title">${highlightTerm(note.title || "(Sans titre)", term)}</span>
          </div>
          <div class="actions">
            <button class="action-btn favorite-btn" title="Favori">
              <i class="far fa-star"></i>
            </button>
          </div>
        `;
        li.addEventListener("click", () => {
            selectNote(note.id);
        });
        li.querySelector("[title='Favori']").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavoriteNote(e, note.id);
        });
        ul.appendChild(li);
    });
}
function updatePagesList(pages, term) {
    const pagesList = document.getElementById("pagesList");
    if (!pagesList) return;
    pagesList.innerHTML = "";
    if (!pages.length) {
        pagesList.innerHTML = `
          <div class="empty-state" style="position:static; height:auto;">
            <i class="fas fa-search"></i>
            <p>Aucune page trouvée</p>
          </div>
        `;
        return;
    }
    const ul = document.createElement("ul");
    ul.className = "item-list";
    pagesList.appendChild(ul);
    pages.forEach((page) => {
        const li = document.createElement("li");
        li.classList.add("search-result");
        li.innerHTML = `
          <div class="page-content">
            <span class="page-title">${highlightTerm(page.title || "(Sans titre)", term)}</span>
          </div>
        `;
        li.addEventListener("click", () => {
            selectPage(page);
        });
        ul.appendChild(li);
    });
}
function highlightTerm(text, term) {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, "gi");
    return text.replace(regex, `<span class="highlight">$1</span>`);
}
function resetSearch() {
    loadNotebooks();
    if (selectedNotebookId) loadNotes(selectedNotebookId);
    if (selectedNoteId) loadPages(selectedNoteId);
}

/****************************
 * 12) FAVORIS (notebooks / notes)
 ****************************/
// Remplacer l'ancienne gestion des favoris basée sur localStorage par Supabase
async function loadFavorites() {
    try {
        // Charger tous les notebooks et notes favoris
        const [nbRes, ntRes] = await Promise.all([
            supabase
                .from('notebooks')
                .select('id, name')
                .eq('user_id', currentUserId)
                .eq('favorite', true),
            supabase
                .from('notes')
                .select('id, title, notebook_id')
                .eq('user_id', currentUserId)
                .eq('favorite', true)
        ]);

        favorites = [
            ...(nbRes.data || []).map(nb => ({
                id: nb.id,
                title: nb.name,
                type: 'notebook'
            })),
            ...(ntRes.data || []).map(note => ({
                id: note.id,
                title: note.title,
                type: 'note',
                notebook_id: note.notebook_id
            }))
        ];

        refreshFavoritesUI();
        updateFavoriteIcons();
    } catch (err) {
        console.error('Erreur loadFavorites:', err);
        showToast('Erreur lors du chargement des favoris', 'error');
    }
}

// Déplacer la fonction refreshFavoritesUI avant son utilisation
function refreshFavoritesUI() {
    const favList = document.getElementById("favoritesList");
    if (!favList) return;
    favList.innerHTML = "";

    if (!favorites.length) {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="empty-favorite">
                <i class="far fa-star"></i>
                <p>Aucun favori</p>
            </div>
        `;
        favList.appendChild(li);
        return;
    }

    favorites.forEach((fav) => {
        const li = document.createElement("li");
        li.className = 'favorite-item';
        li.innerHTML = `
            <div class="favorite-content">
                <i class="fas ${fav.type === 'notebook' ? 'fa-book' : 'fa-file-alt'}"></i>
                <span class="favorite-title">${fav.title || '(Sans titre)'}</span>
            </div>
            <button class="action-btn remove-favorite" title="Retirer des favoris">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Clic sur l'item pour naviguer
        li.querySelector('.favorite-content').addEventListener('click', () => {
            if (fav.type === "notebook") {
                selectNotebook(fav.id);
            } else if (fav.type === "note") {
                selectNotebook(fav.notebook_id);
                setTimeout(() => selectNote(fav.id), 300);
            }
        });

        // Clic sur le bouton de suppression
        li.querySelector('.remove-favorite').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (fav.type === 'notebook') {
                await toggleFavoriteNotebook({ id: fav.id, name: fav.title });
            } else {
                await toggleFavoriteNote({ target: e.target }, fav.id);
            }
        });

        favList.appendChild(li);
    });
}

// Ensuite, les fonctions qui l'utilisent
async function toggleFavoriteNotebook(notebook) {
    try {
        const existing = favorites.find(f => f.id === notebook.id && f.type === 'notebook');
        const newFavoriteState = !existing;

        // Mettre à jour dans Supabase
        const { error } = await supabase
            .from('notebooks')
            .update({ favorite: newFavoriteState })
            .eq('id', notebook.id)
            .eq('user_id', currentUserId);

        if (error) throw error;

        // Mettre à jour l'icône
        const starBtn = document.querySelector(`[data-notebook-id="${notebook.id}"] .favorite-btn i`);
        if (starBtn) {
            starBtn.className = newFavoriteState ? 'fas fa-star' : 'far fa-star';
        }

        // Mettre à jour l'état local
        if (newFavoriteState) {
            favorites.push({
                id: notebook.id,
                title: notebook.name,
                type: 'notebook'
            });
            showToast('Notebook ajouté aux favoris', 'success');
        } else {
            favorites = favorites.filter(f => !(f.id === notebook.id && f.type === 'notebook'));
            showToast('Notebook retiré des favoris', 'info');
        }

        refreshFavoritesUI();
    } catch (err) {
        console.error('Erreur toggleFavoriteNotebook:', err);
        showToast('Erreur lors de la mise à jour du favori', 'error');
    }
}

async function toggleFavoriteNote(e, noteId) {
    e.stopPropagation();
    try {
        const note = currentNotes.find(n => n.id === noteId);
        if (!note) return;

        const existing = favorites.find(f => f.id === note.id && f.type === 'note');
        const newFavoriteState = !existing;

        // Mettre à jour dans Supabase
        const { error } = await supabase
            .from('notes')
            .update({ favorite: newFavoriteState })
            .eq('id', noteId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        // Mettre à jour l'icône
        const starBtn = e.target.closest('.favorite-btn').querySelector('i');
        if (starBtn) {
            starBtn.className = newFavoriteState ? 'fas fa-star' : 'far fa-star';
        }

        // Mettre à jour l'état local
        if (newFavoriteState) {
            favorites.push({
                id: note.id,
                title: note.title,
                type: 'note',
                notebook_id: note.notebook_id
            });
            showToast('Note ajoutée aux favoris', 'success');
        } else {
            favorites = favorites.filter(f => !(f.id === note.id && f.type === 'note'));
            showToast('Note retirée des favoris', 'info');
        }

        refreshFavoritesUI();
    } catch (err) {
        console.error('Erreur toggleFavoriteNote:', err);
        showToast('Erreur lors de la mise à jour du favori', 'error');
    }
}

// Modifier updateFavoriteIcons pour utiliser les données de Supabase
async function updateFavoriteIcons() {
    try {
        // Récupérer tous les éléments favoris
        const [nbRes, ntRes] = await Promise.all([
            supabase
                .from('notebooks')
                .select('id')
                .eq('user_id', currentUserId)
                .eq('favorite', true),
            supabase
                .from('notes')
                .select('id')
                .eq('user_id', currentUserId)
                .eq('favorite', true)
        ]);

        // D'abord, mettre toutes les étoiles en "vide"
        document.querySelectorAll('.favorite-btn i').forEach(star => {
            star.className = 'far fa-star';
        });

        // Mettre à jour les icônes des notebooks favoris
        (nbRes.data || []).forEach(nb => {
            const starBtn = document.querySelector(`[data-notebook-id="${nb.id}"] .favorite-btn i`);
            if (starBtn) {
                starBtn.className = 'fas fa-star';
            }
        });

        // Mettre à jour les icônes des notes favorites
        (ntRes.data || []).forEach(note => {
            const starBtn = document.querySelector(`[data-note-id="${note.id}"] .favorite-btn i`);
            if (starBtn) {
                starBtn.className = 'fas fa-star';
            }
        });
    } catch (err) {
        console.error('Erreur updateFavoriteIcons:', err);
    }
}

/****************************
 * 14) Mode PLEIN ÉCRAN
 ****************************/
function toggleFullscreen() {
    const editorContainer = document.getElementById("editorContainer");
    if (!editorContainer) return;
    editorContainer.classList.toggle("fullscreen");
    const icon = document.querySelector("#toggleFullscreen i");
    if (editorContainer.classList.contains("fullscreen")) {
        icon.className = "fas fa-compress";
    } else {
        icon.className = "fas fa-expand";
    }
}

/****************************
 * Compteur de mots
 ****************************/
function updateWordCount() {
    const content = document.getElementById("editorContent").textContent || "";
    const words = content.trim().split(/\s+/).filter((w) => w.length > 0);
    const wordCountEl = document.getElementById("wordCount");
    if (wordCountEl) {
        wordCountEl.textContent = `${words.length} mot${words.length > 1 ? "s" : ""}`;
    }
}

/****************************
 * Barre de progression de scroll
 ****************************/
function updateScrollProgress() {
    const editorPanel = document.getElementById("editorPanel");
    if (!editorPanel) return;
    const scrollProgress = document.getElementById("scrollProgress");
    if (!scrollProgress) return;

    const { scrollTop, scrollHeight, clientHeight } = editorPanel;
    const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
    scrollProgress.style.width = `${scrolled}%`;
}

/****************************
 * 15) Historique des versions + NOUVELLE FONCTIONNALITÉ : RESTAURER
 ****************************/
async function saveVersion(type, itemId, title, content) {
    try {
        // Insère une nouvelle ligne dans la table "versions"
        // Table exemple: id, user_id, type('note'/'page'), item_id, title, content, date
        const { error } = await supabase.from("versions").insert([
            {
                id: crypto.randomUUID(),
                user_id: currentUserId,
                type,
                item_id: itemId,
                title,
                content,
                date: new Date().toISOString()
            }
        ]);
        if (error) throw error;
    } catch (err) {
        console.error("Erreur saveVersion:", err.message);
    }
}

// Modifier la fonction loadHistory pour ajouter le bouton de prévisualisation
async function loadHistory() {
    // Charge l'historique pour la note ou la page sélectionnée
    const historyList = document.getElementById("historyList");
    if (!historyList) return;
    historyList.innerHTML = "";

    // On ne récupère l'historique que si on a sélectionné un item
    if (!selectedNoteId && !selectedPageId) {
        historyList.innerHTML = `
          <li style="color:var(--text-secondary)">Aucune note ou page sélectionnée</li>
        `;
        return;
    }

    const itemId = editMode === "note" ? selectedNoteId : selectedPageId;
    const { data, error } = await supabase
        .from("versions")
        .select("*")
        .eq("user_id", currentUserId)
        .eq("type", editMode)
        .eq("item_id", itemId)
        .order("date", { ascending: false });

    if (error) {
        console.error("Erreur loadHistory:", error);
        historyList.innerHTML = "<li>Erreur de chargement</li>";
        return;
    }
    if (!data || !data.length) {
        historyList.innerHTML = `
          <li style="color:var(--text-secondary)">Aucune version enregistrée</li>
        `;
        return;
    }

    data.forEach((version) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="version-item">
                <div class="version-info">
                    <span class="version-date">[${new Date(version.date).toLocaleString()}]</span>
                    <span class="version-title">${version.title || "(Sans titre)"}</span>
                </div>
                <div class="version-actions">
                    <button class="preview-btn" title="Prévisualiser">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="restore-btn" data-version-id="${version.id}">
                        <i class="fas fa-history"></i> Restaurer
                    </button>
                </div>
            </div>
        `;

        // Bouton "Prévisualiser"
        li.querySelector(".preview-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            previewVersion(version);
        });

        // Bouton "Restaurer"
        li.querySelector(".restore-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm('Voulez-vous vraiment restaurer cette version ?')) {
                restoreVersion(version);
            }
        });

        historyList.appendChild(li);
    });
}

// Ajouter la nouvelle fonction de prévisualisation
function previewVersion(version) {
    // Créer une modale de prévisualisation
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
        <div class="preview-content">
            <div class="preview-header">
                <h3>Prévisualisation de la version</h3>
                <button class="close-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="preview-body">
                <h4>${version.title || "(Sans titre)"}</h4>
                <div class="preview-text">${version.content || "(Contenu vide)"}</div>
            </div>
        </div>
    `;

    // Gérer la fermeture
    modal.querySelector('.close-btn').addEventListener('click', () => {
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    document.body.appendChild(modal);
}

/**
 * Nouvelle fonctionnalité majeure : Restaurer une version précédente
 */
async function restoreVersion(version) {
    if (!version) return;
    // 1) On met à jour l'éditeur
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");
    editorTitle.textContent = version.title || "";
    editorContent.innerHTML = version.content || "";

    // 2) On sauvegarde immédiatement en BD la note/page avec ce contenu
    const now = new Date().toISOString();
    if (editMode === "note" && selectedNoteId) {
        const { error } = await supabase
            .from("notes")
            .update({
                title: version.title,
                content: version.content,
                last_modified: now
            })
            .eq("id", selectedNoteId)
            .eq("user_id", currentUserId);
        if (error) {
            console.error("Erreur restoreVersion (note):", error);
            showToast("Erreur restauration", "error");
            return;
        }
        // On enregistre cette restauration comme nouvelle version
        await saveVersion("note", selectedNoteId, version.title, version.content);
        await loadNotes(selectedNotebookId);
    } else if (editMode === "page" && selectedPageId) {
        const { error } = await supabase
            .from("pages")
            .update({
                title: version.title,
                content: version.content,
                last_modified: now
            })
            .eq("id", selectedPageId)
            .eq("user_id", currentUserId);
        if (error) {
            console.error("Erreur restoreVersion (page):", error);
            showToast("Erreur restauration", "error");
            return;
        }
        // On enregistre cette restauration comme nouvelle version
        await saveVersion("page", selectedPageId, version.title, version.content);
        await loadPages(selectedNoteId);
    }
    showToast("Version restaurée avec succès", "success");
}

async function exportToPDF() {
    try {
        const editorTitle = document.getElementById('editorTitle');
        const editorContent = document.getElementById('editorContent');

        if (!editorTitle || !editorContent) {
            showToast("Aucun contenu à exporter", "error");
            return;
        }

        // Créer un conteneur temporaire pour le contenu formaté
        const tempContainer = document.createElement('div');
        tempContainer.style.width = '800px';
        tempContainer.style.padding = '40px';
        tempContainer.style.background = 'white';
        tempContainer.style.color = '#000';
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';

        // Style CSS optimisé pour le PDF
        const styleSheet = `
            * {
                font-family: Arial, sans-serif;
                line-height: 1.5;
                color: #000 !important;
                box-sizing: border-box;
            }
            h1, h2, h3 { margin: 1em 0 0.5em 0; }
            h1 { font-size: 24px; }
            h2 { font-size: 20px; }
            h3 { font-size: 16px; }
            p { margin: 0.5em 0; }
            img { 
                max-width: 100%; 
                margin: 1em auto; 
                display: block;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 1em 0;
            }
            td, th {
                border: 1px solid #ddd;
                padding: 8px;
            }
            blockquote {
                margin: 1em 0;
                padding: 10px 20px;
                border-left: 5px solid #ddd;
                background: #f9f9f9;
            }
            ul, ol {
                margin: 0.5em 0;
                padding-left: 20px;
            }
            code, pre {
                background: #f5f5f5;
                padding: 2px 5px;
                border-radius: 3px;
                font-family: monospace;
            }
        `;

        // Ajout du style et du contenu
        tempContainer.innerHTML = `
            <style>${styleSheet}</style>
            <div class="pdf-header" style="margin-bottom: 30px; text-align: center;">
                <h1 style="font-size: 28px; color: #2563eb !important; margin-bottom: 10px;">
                    ${editorTitle.textContent || "Document sans titre"}
                </h1>
                <div style="font-size: 12px; color: #666 !important;">
                    Exporté le ${new Date().toLocaleString()}
                </div>
            </div>
            <div class="pdf-content">
                ${editorContent.innerHTML}
            </div>
        `;

        document.body.appendChild(tempContainer);

        // Indicateur de chargement
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.style.position = 'fixed';
        loadingIndicator.style.top = '50%';
        loadingIndicator.style.left = '50%';
        loadingIndicator.style.transform = 'translate(-50%, -50%)';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        loadingIndicator.style.color = '#fff';
        loadingIndicator.style.borderRadius = '5px';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération du PDF en cours...';
        document.body.appendChild(loadingIndicator);

        try {
            // Attendre un petit délai pour s'assurer que tout est bien rendu (images, etc.)
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Options de conversion optimisées
            const canvas = await html2canvas(tempContainer, {
                scale: 3,         // Augmentation de la résolution pour un rendu plus net
                useCORS: true,    // Autorise la récupération d’images cross-origin
                logging: false,
                allowTaint: false,
                backgroundColor: '#FFFFFF'
            });

            // Initialiser jsPDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            // Dimensions PDF
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;   // marges de gauche et de droite
            const usableWidth = pageWidth - (2 * margin);

            // Conversion du canvas en image
            const imgData = canvas.toDataURL('image/jpeg', 1.0);

            // Calcul de la hauteur finale en gardant le ratio
            const imgWidth = usableWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let position = 0;
            let heightLeft = imgHeight;
            let pageNumber = 1;

            // Ajouter l'image page par page
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= (pageHeight - margin * 2);

            // Gestion des pages multiples
            while (heightLeft > 0) {
                position = - (imgHeight - heightLeft) + margin; // Décalage pour la page suivante
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                heightLeft -= (pageHeight - margin * 2);
                pageNumber++;
            }

            // Ajouter les numéros de page (optionnel)
            for (let i = 1; i <= pageNumber; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(100);
                pdf.text(
                    `Page ${i} sur ${pageNumber}`,
                    pageWidth / 2,
                    pageHeight - 5,
                    { align: 'center' }
                );
            }

            // Générer le nom du fichier
            const fileName = `${editorTitle.textContent || 'Document'}_${new Date().toISOString().slice(0, 10)}.pdf`;

            // Sauvegarder le PDF
            pdf.save(fileName);
            showToast("PDF exporté avec succès", "success");

        } finally {
            // Nettoyage
            document.body.removeChild(tempContainer);
            document.body.removeChild(loadingIndicator);
        }

    } catch (error) {
        console.error("Erreur lors de l'export PDF:", error);
        showToast("Erreur lors de l'export PDF", "error");
    }
}


// Modifier la fonction generateTableOfContents
function generateTableOfContents() {
    const editorContent = document.getElementById("editorContent");
    if (!editorContent) return;

    const existingTOC = editorContent.querySelector('.toc-container');
    if (existingTOC) {
        existingTOC.remove();
    }

    const headings = editorContent.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
        showToast("Aucun titre trouvé pour générer la table des matières", "info");
        return;
    }

    const tocContainer = document.createElement('div');
    tocContainer.className = 'toc-container';
    tocContainer.innerHTML = `
        <div class="toc-title">
            <i class="fas fa-list-ol"></i>
            Table des matières
        </div>
        <ul class="toc-list"></ul>
    `;

    const tocList = tocContainer.querySelector('.toc-list');

    headings.forEach((heading, index) => {
        const headingId = `heading-${index}`;
        heading.id = headingId;

        // Récupérer le contenu de la section jusqu'au prochain titre
        let previewContent = '';
        let nextElement = heading.nextElementSibling;
        while (nextElement && !['H1', 'H2', 'H3'].includes(nextElement.tagName)) {
            previewContent += nextElement.innerText + ' ';
            nextElement = nextElement.nextElementSibling;
        }

        // Limiter la longueur de la prévisualisation
        const truncatedPreview = previewContent.slice(0, 200) + (previewContent.length > 200 ? '...' : '');

        const li = document.createElement('li');
        li.className = 'toc-item';
        li.setAttribute('data-level', heading.tagName.toLowerCase());

        // Ajouter le tooltip de prévisualisation
        li.innerHTML = `
            <span class="toc-link" data-target="${headingId}">
                ${heading.textContent}
                <div class="toc-preview-tooltip">
                    <div class="toc-preview-content">
                        <strong>${heading.textContent}</strong>
                        <p>${truncatedPreview}</p>
                    </div>
                </div>
            </span>
        `;

        // Gérer la position du tooltip
        const link = li.querySelector('.toc-link');
        link.addEventListener('mouseenter', (e) => {
            const tooltip = link.querySelector('.toc-preview-tooltip');
            const rect = link.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceRight = window.innerWidth - rect.right;

            // Positionner le tooltip en fonction de l'espace disponible
            if (spaceBelow < 220) { // 200px hauteur + 20px marge
                tooltip.style.bottom = '100%';
                tooltip.style.top = 'auto';
            } else {
                tooltip.style.top = '100%';
                tooltip.style.bottom = 'auto';
            }

            if (spaceRight < 320) { // 300px largeur + 20px marge
                tooltip.style.right = '0';
                tooltip.style.left = 'auto';
            } else {
                tooltip.style.left = '100%';
                tooltip.style.right = 'auto';
            }

            tooltip.classList.add('visible');
        });

        link.addEventListener('mouseleave', (e) => {
            const tooltip = link.querySelector('.toc-preview-tooltip');
            tooltip.classList.remove('visible');
        });

        link.addEventListener('click', () => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        // Empêcher le lien de se fermer pendant le scroll
        const tooltip = li.querySelector('.toc-preview-tooltip');
        tooltip.addEventListener('mousewheel', (e) => {
            e.stopPropagation();
        });

        tooltip.addEventListener('wheel', (e) => {
            e.stopPropagation();
        });

        tocList.appendChild(li);
    });

    editorContent.insertBefore(tocContainer, editorContent.firstChild);
    saveCurrent();
    showToast("Table des matières générée", "success");
}
/****************************************************
  Charger et afficher les todos
*****************************************************/
async function loadTodos() {
    try {
        const projectValue = document.getElementById('projectFilter').value;
        const statusValue = document.getElementById('todoFilter').value;
        const dateValue = document.getElementById('dueDateFilter').value;
        const searchValue = document.getElementById('todoSearchInput').value.trim().toLowerCase();

        // Construction de la requête de base
        let query = supabase
            .from('todos')
            .select('*')
            .eq('user_id', currentUserId);

        // Filtrer par projet
        if (projectValue !== 'all') {
            query = query.eq('project', projectValue);
        }

        // Filtrer par statut
        if (statusValue === 'pending') {
            query = query.eq('completed', false).eq('archived', false);
        } else if (statusValue === 'completed') {
            query = query.eq('completed', true).eq('archived', false);
        } else if (statusValue === 'archived') {
            query = query.eq('archived', true);
        } else {
            // Par défaut : on affiche les todos non archivés
            query = query.eq('archived', false);
        }

        // Filtre par date
        const now = new Date();
        if (dateValue === 'today') {
            const today = now.toISOString().split('T')[0];
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            query = query.gte('due_date', today).lt('due_date', tomorrowStr);
        } else if (dateValue === 'week') {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            query = query.lte('due_date', nextWeek.toISOString());
        } else if (dateValue === 'month') {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            query = query.lte('due_date', nextMonth.toISOString());
        } else if (dateValue === 'overdue') {
            query = query.lt('due_date', now.toISOString());
        }

        // Récupération des données
        let { data: todos, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        // Filtrer par texte (search) côté client,
        // si vous préférez, vous pouvez aussi gérer la recherche côté serveur
        if (searchValue) {
            todos = todos.filter(todo =>
                todo.text.toLowerCase().includes(searchValue) ||
                (todo.project && todo.project.toLowerCase().includes(searchValue))
            );
        }

        // Affichage
        const todoList = document.getElementById('todoList');
        todoList.innerHTML = '';

        if (!todos || todos.length === 0) {
            todoList.innerHTML = `
          <li class="todo-empty">
            <i class="fas fa-tasks"></i>
            <p>Aucune tâche</p>
          </li>
        `;
            return;
        }

        todos.forEach(todo => {
            const li = createTodoElement(todo);
            todoList.appendChild(li);
        });
    } catch (err) {
        console.error('Erreur loadTodos:', err);
        showToast('Erreur lors du chargement des tâches', 'error');
    }
}

/****************************************************
  Créer un élément DOM pour une tâche
*****************************************************/
function createTodoElement(todo) {
    const li = document.createElement('li');
    const urgencyClass = getUrgencyClass(todo.due_date);

    li.className = `todo-item ${todo.completed ? 'completed' : ''} ${urgencyClass}`;
    li.dataset.todoId = todo.id;

    // Badge projet si nécessaire
    const projectBadge = todo.project
        ? `<span class="todo-project-badge">${escapeHtml(todo.project)}</span>`
        : '';

    li.innerHTML = `
      <input 
        type="checkbox" 
        class="todo-checkbox" 
        ${todo.completed ? 'checked' : ''}>
      
      <div class="todo-content">
        <p class="todo-text">
          ${projectBadge} ${escapeHtml(todo.text)}
        </p>
        ${todo.due_date
            ? `<span class="todo-date ${urgencyClass}">
                 <i class="fas fa-clock"></i> ${formatDueDate(todo.due_date)}
               </span>`
            : ''
        }
      </div>
  
      <div class="todo-actions">
        <button class="todo-action-btn edit" title="Modifier">
          <i class="fas fa-edit"></i>
        </button>
        <button class="todo-action-btn archive" title="Archiver">
          <i class="fas fa-archive"></i>
        </button>
        <button class="todo-action-btn delete" title="Supprimer">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;

    setupTodoListeners(li, todo);
    return li;
}

/****************************************************
  Gestion des événements sur une tâche
*****************************************************/
function setupTodoListeners(li, todo) {
    const checkbox = li.querySelector('.todo-checkbox');
    const textEl = li.querySelector('.todo-text');
    const editBtn = li.querySelector('.todo-action-btn.edit');
    const archiveBtn = li.querySelector('.todo-action-btn.archive');
    const deleteBtn = li.querySelector('.todo-action-btn.delete');

    // Cocher/décocher
    checkbox.addEventListener('change', async (e) => {
        await toggleTodoComplete(todo.id, e.target.checked);
        li.classList.toggle('completed', e.target.checked);
    });

    // Édition de la tâche (texte)
    let isEditing = false;
    editBtn.addEventListener('click', async () => {
        isEditing = !isEditing;
        textEl.contentEditable = isEditing;
        editBtn.innerHTML = isEditing
            ? '<i class="fas fa-check"></i>'
            : '<i class="fas fa-edit"></i>';

        if (isEditing) {
            // Focus à la fin du texte
            const range = document.createRange();
            range.selectNodeContents(textEl);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            textEl.focus();
        } else {
            // Sauvegarder
            const textSansBadge = textEl.textContent.trim();
            await updateTodoText(todo.id, textSansBadge);
        }
    });

    // Archiver
    archiveBtn.addEventListener('click', async () => {
        if (confirm('Voulez-vous archiver cette tâche ?')) {
            await archiveTodo(todo.id);
            await loadTodos();
        }
    });

    // Supprimer
    deleteBtn.addEventListener('click', async () => {
        if (confirm('Voulez-vous supprimer cette tâche ?')) {
            await deleteTodo(todo.id);
            await loadTodos();
        }
    });
}

/****************************************************
  Fonctions utilitaires
*****************************************************/
// Échappe le HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formatage de date
function formatDueDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// Calcul de l'urgence
function getUrgencyClass(dueDate) {
    if (!dueDate) return '';
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'urgent';     // Dépassé
    if (diffDays <= 2) return 'warning';  // Très proche
    return '';
}

// Notification simple
function showToast(message, type) {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

/****************************************************
  Opérations CRUD avec Supabase
****************************************************/
// Basculer l'état complété
async function toggleTodoComplete(todoId, completed) {
    try {
        const { error } = await supabase
            .from('todos')
            .update({ completed })
            .eq('id', todoId)
            .eq('user_id', currentUserId);

        if (error) throw error;
        showToast(completed ? 'Tâche terminée' : 'Tâche à faire', 'success');
    } catch (err) {
        console.error('Erreur toggleTodoComplete:', err);
        showToast('Erreur lors de la mise à jour', 'error');
    }
}

// Mettre à jour le texte
async function updateTodoText(todoId, newText) {
    try {
        const { error } = await supabase
            .from('todos')
            .update({ text: newText })
            .eq('id', todoId)
            .eq('user_id', currentUserId);

        if (error) throw error;
        showToast('Tâche modifiée', 'success');
    } catch (err) {
        console.error('Erreur updateTodoText:', err);
        showToast('Erreur lors de la mise à jour', 'error');
    }
}

// Archiver
async function archiveTodo(todoId) {
    try {
        const { error } = await supabase
            .from('todos')
            .update({ archived: true })
            .eq('id', todoId)
            .eq('user_id', currentUserId);

        if (error) throw error;
        showToast('Tâche archivée', 'success');
    } catch (err) {
        console.error('Erreur archiveTodo:', err);
        showToast("Erreur lors de l'archivage", 'error');
    }
}

// Supprimer
async function deleteTodo(todoId) {
    try {
        const { error } = await supabase
            .from('todos')
            .delete()
            .eq('id', todoId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        // Recharger la liste des projets après suppression
        await Promise.all([
            loadProjectOptions(),
            loadTodos()
        ]);

        showToast('Tâche supprimée', 'success');
    } catch (err) {
        console.error('Erreur deleteTodo:', err);
        showToast('Erreur lors de la suppression', 'error');
    }
}

// Effacer toutes les tâches terminées
async function clearCompletedTodos() {
    try {
        const { error } = await supabase
            .from('todos')
            .delete()
            .eq('completed', true)
            .eq('archived', false)
            .eq('user_id', currentUserId);

        if (error) throw error;
        showToast('Toutes les tâches terminées ont été supprimées', 'success');
    } catch (err) {
        console.error('Erreur clearCompletedTodos:', err);
        showToast('Erreur lors de la suppression des tâches terminées', 'error');
    }
}

async function ArchiveCompletedBtn() {
    try {
        const { error } = await supabase
            .from('todos')
            .update({ archived: true })
            .eq('completed', true)
            .eq('archived', false)
            .eq('user_id', currentUserId);

        if (error) throw error;
        showToast('Toutes les tâches terminées ont été archivées', 'success');
    } catch (err) {
        console.error('Erreur ArchiveCompletedBtn:', err);
        showToast('Erreur lors de l’archivage des tâches terminées', 'error');
    }
}

/****************************************************
  Ajouter une nouvelle tâche
*****************************************************/
async function addTodo() {
    const input = document.getElementById('todoInput');
    const projectInput = document.getElementById('todoProject');
    const dueDateInput = document.getElementById('todoDueDate');

    const text = input.value.trim();
    const project = projectInput.value.trim();
    const dueDate = dueDateInput.value;

    if (!text) return;

    try {
        // Génération d’un ID unique (si supporté par l’environnement)
        const newTodo = {
            id: crypto.randomUUID(),
            user_id: currentUserId,
            text,
            project: project || null,
            due_date: dueDate || null,
            completed: false,
            archived: false,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('todos')
            .insert([newTodo]);

        if (error) throw error;

        input.value = '';
        projectInput.value = '';
        dueDateInput.value = '';

        // Recharger la liste des projets et les todos
        await Promise.all([
            loadProjectOptions(),
            loadTodos()
        ]);

        showToast('Tâche ajoutée', 'success');
    } catch (err) {
        console.error('Erreur addTodo:', err);
        showToast("Erreur lors de l'ajout", 'error');
    }
}

/****************************************************
  Charger les projets dans la liste de sélection
*****************************************************/
async function loadProjectOptions() {
    const projectSelect = document.getElementById('projectFilter');
    if (!projectSelect) return;

    try {
        // Récupère la liste distincte des projets
        const { data, error } = await supabase
            .from('todos')
            .select('project')
            .eq('user_id', currentUserId)
            .not('project', 'is', null); // Exclure les projets null

        if (error) throw error;

        // Extraire les projets uniques
        const uniqueProjects = [...new Set(data.map(item => item.project))].sort();

        // Conserver la sélection actuelle
        const currentSelection = projectSelect.value;

        // Reconstruire les options
        projectSelect.innerHTML = `<option value="all">Tous projets</option>`;
        uniqueProjects.forEach(proj => {
            projectSelect.innerHTML += `
                <option value="${escapeHtml(proj)}" ${currentSelection === proj ? 'selected' : ''}>
                    ${escapeHtml(proj)}
                </option>
            `;
        });
    } catch (err) {
        console.error('Erreur loadProjectOptions:', err);
        showToast('Erreur lors du chargement des projets', 'error');
    }
}