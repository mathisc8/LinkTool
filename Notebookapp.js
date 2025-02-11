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
});

/****************************
 * Vérification de l'authentification (exemple)
 ****************************/
async function checkAuth() {
    // Exemple fictif
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        console.log("Utilisateur non connecté (démo).");
        // Vous pourriez rediriger vers un login
    } else {
        currentUserId = user.id;
    }
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
    const icon = document.querySelector(".theme-toggle i");
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
                <!-- Favori -->
                <button class="action-btn" title="Mettre en Favori">
                  <i class="fas fa-star"></i>
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
              <!-- Favori sur la Note -->
              <button class="action-btn" title="Favori" onclick="toggleFavoriteNote(event, '${note.id}')">
                <i class="fas fa-star"></i>
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
                    "table", "tr", "td", "th", "thead", "tbody"
                ],
                ALLOWED_ATTR: ["src", "alt", "style", "class", "data-*", "border"],
            });
            editorContent.innerHTML = sanitizedContent;
            // Réattacher les listeners aux images (pour le resize, etc.)
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
                "<table border='1' style='border-collapse: collapse'><tr><td>Cell1</td><td>Cell2</td></tr><tr><td>Cell3</td><td>Cell4'></td></tr></table>"
            );
            break;
        case "highlight":
            document.execCommand("backColor", false, "#fef08a"); // jaune clair
            break;
        case "blockquote":
            document.execCommand("formatBlock", false, "BLOCKQUOTE");
            break;
        default:
            // Commandes natives
            document.execCommand(command, false, value);
    }
    updateFormatButtonStates();
    saveCurrent();
}
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
              <button class="action-btn" title="Mettre en Favori">
                <i class="fas fa-star"></i>
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
            <button class="action-btn" title="Favori">
              <i class="fas fa-star"></i>
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
function loadFavorites() {
    const favData = localStorage.getItem("favorites");
    favorites = favData ? JSON.parse(favData) : [];
    refreshFavoritesUI();
}
function saveFavorites() {
    localStorage.setItem("favorites", JSON.stringify(favorites));
}
function refreshFavoritesUI() {
    const favList = document.getElementById("favoritesList");
    if (!favList) return;
    favList.innerHTML = "";
    if (!favorites.length) {
        const li = document.createElement("li");
        li.textContent = "Aucun favori";
        li.style.color = "var(--text-secondary)";
        favList.appendChild(li);
        return;
    }
    favorites.forEach((fav) => {
        const li = document.createElement("li");
        li.textContent = fav.title;
        li.addEventListener("click", () => {
            if (fav.type === "notebook") {
                selectNotebook(fav.id);
            } else if (fav.type === "note") {
                selectNotebook(fav.notebook_id);
                setTimeout(() => {
                    selectNote(fav.id);
                }, 300);
            }
        });
        favList.appendChild(li);
    });
}
function toggleFavoriteNotebook(notebook) {
    const existing = favorites.find(
        (f) => f.id === notebook.id && f.type === "notebook"
    );
    if (existing) {
        favorites = favorites.filter((f) => f !== existing);
        showToast("Notebook retiré des favoris", "info");
    } else {
        favorites.push({
            id: notebook.id,
            title: notebook.name,
            type: "notebook",
        });
        showToast("Notebook ajouté aux favoris", "success");
    }
    saveFavorites();
    refreshFavoritesUI();
}
function toggleFavoriteNote(e, noteId) {
    e.stopPropagation();
    const note = currentNotes.find((n) => n.id === noteId);
    if (!note) return;
    const existing = favorites.find((f) => f.id === note.id && f.type === "note");
    if (existing) {
        favorites = favorites.filter((f) => f !== existing);
        showToast("Note retirée des favoris", "info");
    } else {
        favorites.push({
            id: note.id,
            title: note.title,
            type: "note",
            notebook_id: note.notebook_id,
        });
        showToast("Note ajoutée aux favoris", "success");
    }
    saveFavorites();
    refreshFavoritesUI();
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
          <div>
            <span>[${new Date(version.date).toLocaleString()}] ${version.title || "(Sans titre)"}</span>
            <!-- Bouton Restaurer la version -->
            <button class="restore-btn" data-version-id="${version.id}">Restaurer</button>
          </div>
        `;
        // Cliquez sur la zone hors bouton => preview ou info
        li.addEventListener("click", (ev) => {
            if (!ev.target.matches(".restore-btn")) {
                alert(
                    "Contenu de cette version:\n\n" + (version.content || "(vide)")
                );
            }
        });
        // Bouton "Restaurer"
        li.querySelector(".restore-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            restoreVersion(version);
        });
        historyList.appendChild(li);
    });
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
        tempContainer.style.color = '#000';  // Force le texte en noir
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';

        // Style CSS optimisé pour le PDF
        const styleSheet = `
                    * {
                        font-family: Arial, sans-serif;
                        line-height: 1.5;
                        color: #000 !important;
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
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération du PDF en cours...';
        document.body.appendChild(loadingIndicator);

        try {
            // Options de conversion optimisées
            const canvas = await html2canvas(tempContainer, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: '#FFFFFF'
            });

            // Initialiser jsPDF avec des marges optimisées
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            // Dimensions et marges
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;  // Marge en mm
            const usableWidth = pageWidth - (2 * margin);

            // Conversion du canvas en image
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const imgWidth = usableWidth;
            const imgHeight = canvas.height * imgWidth / canvas.width;

            let heightLeft = imgHeight;
            let position = margin;  // Position Y initiale
            let pageNumber = 1;

            // Ajouter l'image page par page
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= (pageHeight - 2 * margin);

            // Gestion des pages multiples
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                heightLeft -= (pageHeight - 2 * margin);
                pageNumber++;
            }

            // Ajouter les numéros de page
            for (let i = 1; i <= pageNumber; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(100);
                pdf.text(
                    `Page ${i} sur ${pageNumber}`,
                    pageWidth / 2,
                    pageHeight - 10,
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
            loadingIndicator.remove();
        }

    } catch (error) {
        console.error('Erreur lors de l\'export PDF:', error);
        showToast("Erreur lors de l'export PDF", "error");
    }
}