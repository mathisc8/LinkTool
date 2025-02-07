/****************************
 * Configuration Supabase
 ****************************/
const supabaseUrl = "https://qnqkizhwtwsptqnayfpd.supabase.co";
const supabaseKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucWtpemh3dHdzcHRxbmF5ZnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4NTE3ODYsImV4cCI6MjA1MjQyNzc4Nn0.oP5hXVIo1bAGLCYcqEOIEpyFZNhaQ43eNsvU9i_Qq6Q";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

/****************************
 * State global
 ****************************/
let selectedNotebookId = null;
let selectedNoteId = null;
let selectedPageId = null;

// Pour savoir si on édite une NOTE ou une PAGE
let editMode = null; // "note" ou "page"
let currentUserId = null;

// Ajouter aux variables globales
let currentNotes = [];

/****************************
 * Navigation
 ****************************/
function goHome() {
    // Exemple : rediriger vers une page d'accueil
    window.location.href = "accueil.html";
    // Ou ce que tu souhaites
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
 * Au chargement : init
 ****************************/
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return false;
    }
    currentUserId = user.id;
    return true;
}

document.addEventListener("DOMContentLoaded", async () => {
    // Vérifier l'authentification avant toute chose
    if (!await checkAuth()) return;

    initTheme();
    await loadNotebooks();
    setupAutoSave();

    // Event listener pour le toggle du thème
    document
        .getElementById("themeToggle")
        ?.addEventListener("click", toggleTheme);

    // Afficher "No selection" au départ
    showEmptyState(true);
});

/****************************
 * 1) GESTION DES NOTEBOOKS
 ****************************/

/** Charger la liste des Notebooks depuis Supabase */
async function loadNotebooks() {
    try {
        const { data, error } = await supabase
            .from("notebooks")
            .select("*")
            .eq('user_id', currentUserId) // Ajouter ce filtre
            .order("name", { ascending: true });

        if (error) throw error;

        const listDiv = document.getElementById("notebooksList");
        listDiv.innerHTML = "";

        data.forEach((notebook) => {
            const notebookEl = document.createElement("div");
            notebookEl.className = "notebook-item";

            notebookEl.innerHTML = `
        <div class="notebook-title ${notebook.id === selectedNotebookId ? "active" : ""
                }" data-notebook-id="${notebook.id}">
          <div class="notebook-title-left">
            <i class="fas ${notebook.id === selectedNotebookId ? "fa-book-open" : "fa-book"
                }"></i>
            <span class="notebook-name">${notebook.name}</span>
          </div>
          <div class="notebook-actions">
            <button class="action-btn edit-btn" title="Renommer">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete-btn" title="Supprimer">
                <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;

            // Clic sur le titre du Notebook => sélection
            notebookEl
                .querySelector(".notebook-title")
                .addEventListener("click", () => {
                    selectNotebook(notebook.id);
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
                        confirm(`Voulez-vous vraiment supprimer le Notebook "${notebook.name}" ?`)
                    ) {
                        await deleteNotebook(notebook.id);
                    }
                });

            listDiv.appendChild(notebookEl);
        });

        // Si un notebook est sélectionné, recharger la liste de notes
        if (selectedNotebookId) {
            await loadNotes(selectedNotebookId);
        }
    } catch (err) {
        console.error("Erreur loadNotebooks:", err.message);
    }
}

function selectNotebook(notebookId) {
    // Mise à jour des classes active
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
    loadPages(null); // Réinitialise la liste des pages
    updateHierarchyPath();
    showEmptyState(true); // On ré-initialise l'état vide en attendant la selection d'une note
}

async function createNotebook() {
    const name = prompt("Nom du Notebook :");
    if (!name) return;

    try {
        const newNotebook = {
            id: crypto.randomUUID(),
            name,
            user_id: currentUserId // Ajouter l'user_id
        };

        const { error } = await supabase
            .from("notebooks")
            .insert([newNotebook]);
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
        // Supprimer d'abord les notes/pages associées si nécessaire
        // ou tu peux mettre des contraintes ON CASCADE dans Supabase

        const { error } = await supabase
            .from("notebooks")
            .delete()
            .eq("id", notebookId);
        if (error) throw error;

        // Si on supprime le notebook sélectionné, on reset la sélection
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
    try {
        const { data, error } = await supabase
            .from("notes")
            .select("*")
            .eq("notebook_id", notebookId)
            .eq("user_id", currentUserId) // Ajouter ce filtre
            .order("last_modified", { ascending: false });
        if (error) throw error;

        // Stocker les notes chargées
        currentNotes = data || [];

        const notesListDiv = document.getElementById("notesList");
        notesListDiv.innerHTML = "";

        if (currentNotes.length === 0) {
            notesListDiv.innerHTML = `
                <div class="empty-state" style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
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
            li.className = note.id === selectedNoteId ? 'active' : '';
            li.innerHTML = `
                <span>${note.title || "(Sans titre)"}</span>
                <div class="actions">
                    <button class="action-btn delete-btn" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            li.querySelector("span").onclick = () => selectNote(note.id);
            li.querySelector(".delete-btn").onclick = async (e) => {
                e.stopPropagation();
                if (confirm("Voulez-vous vraiment supprimer cette note ?")) {
                    await deleteNote(note.id);
                }
            };

            ul.appendChild(li);
        });
    } catch (err) {
        console.error("Erreur loadNotes:", err.message);
    }
}

async function createNote() {
    if (!selectedNotebookId) {
        alert("Sélectionne d'abord un Notebook !");
        return;
    }

    const title = prompt("Titre de la Note :");
    if (title === null) return; // Annulé

    const now = new Date().toISOString();
    const newNote = {
        id: crypto.randomUUID(),
        notebook_id: selectedNotebookId,
        title,
        content: "",
        date_created: now,
        last_modified: now,
        user_id: currentUserId // Ajouter l'user_id
    };

    try {
        const { error } = await supabase.from("notes").insert([newNote]);
        if (error) throw error;

        await loadNotes(selectedNotebookId);
    } catch (err) {
        console.error("Erreur createNote:", err.message);
    }
}

function selectNote(noteId) {
    const note = currentNotes.find(n => n.id === noteId);
    if (!note) return;

    // Mettre à jour la sélection visuelle
    document.querySelectorAll('#notesList li').forEach(li => {
        li.classList.toggle('active', li.querySelector('span').textContent === (note.title || "(Sans titre)"));
    });

    selectedNoteId = note.id;
    selectedPageId = null;
    editMode = "note";

    // Afficher le titre et contenu dans l'éditeur
    showInEditor(note.title, note.content);

    // Charger les pages associées
    loadPages(note.id);

    updateHierarchyPath();
    showEmptyState(false);
}

async function deleteNote(noteId) {
    try {
        const { error } = await supabase
            .from("notes")
            .delete()
            .eq("id", noteId);

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
    try {
        if (!noteId) {
            // Si pas de note sélectionnée, on vide la liste des pages
            const pagesListDiv = document.getElementById("pagesList");
            if (pagesListDiv) {
                pagesListDiv.innerHTML = `
                    <div class="empty-state" style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
                        <i class="fas fa-file-alt"></i>
                        <p>Sélectionnez une note pour voir ses pages</p>
                    </div>
                `;
            }
            return;
        }

        const { data, error } = await supabase
            .from("pages")
            .select("*")
            .eq("note_id", noteId)
            .eq("user_id", currentUserId)
            .order("last_modified", { ascending: false });

        if (error) throw error;

        const pagesListDiv = document.getElementById("pagesList");
        pagesListDiv.innerHTML = "";

        // Ajouter un message si pas de pages
        if (!data || data.length === 0) {
            pagesListDiv.innerHTML = `
                <div class="empty-state" style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
                    <i class="fas fa-file-alt"></i>
                    <p>Aucune page dans cette note</p>
                </div>
            `;
            return;
        }

        const ul = document.createElement("ul");
        ul.className = "item-list";

        data.forEach((page) => {
            const li = document.createElement("li");
            li.className = page.id === selectedPageId ? 'active' : '';
            li.innerHTML = `
                <span>${page.title || "(Sans titre)"}</span>
                <div class="actions">
                    <button class="action-btn delete-btn" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            li.querySelector("span").onclick = () => selectPage(page);
            li.querySelector(".delete-btn").onclick = async (e) => {
                e.stopPropagation();
                if (confirm("Voulez-vous vraiment supprimer cette page ?")) {
                    await deletePage(page.id);
                }
            };

            ul.appendChild(li);
        });

        pagesListDiv.appendChild(ul);
    } catch (err) {
        console.error("Erreur loadPages:", err.message);
    }
}

async function createPage() {
    if (!selectedNoteId) {
        alert("Sélectionne d'abord une Note !");
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
        user_id: currentUserId // Ajouter l'user_id
    };

    try {
        const { error } = await supabase.from("pages").insert([newPage]);
        if (error) throw error;

        await loadPages(selectedNoteId);
    } catch (err) {
        console.error("Erreur createPage:", err.message);
    }
}

function selectPage(page) {
    selectedPageId = page.id;
    editMode = "page";
    showInEditor(page.title, page.content);
    updateHierarchyPath();
    showEmptyState(false);
}

async function deletePage(pageId) {
    try {
        const { error } = await supabase
            .from("pages")
            .delete()
            .eq("id", pageId);

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
 * 4) EDITEUR (Note ou Page)
 ****************************/
function showInEditor(title, content) {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    if (editorTitle && editorContent) {
        editorTitle.textContent = title || "";
        editorContent.textContent = content || "";

        // Rendre les éléments éditables
        editorTitle.contentEditable = "true";
        editorContent.contentEditable = "true";
    }
}

async function saveCurrent() {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    const newTitle = editorTitle.textContent.trim();
    const newContent = editorContent.textContent;
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
                .eq("id", selectedNoteId);
            if (error) throw error;
            // On ne fait pas forcément d'alert("..."), ça peut être agaçant
            await loadNotes(selectedNotebookId);

        } else if (editMode === "page" && selectedPageId) {
            const { error } = await supabase
                .from("pages")
                .update({
                    title: newTitle,
                    content: newContent,
                    last_modified: now,
                })
                .eq("id", selectedPageId);
            if (error) throw error;
            await loadPages(selectedNoteId);
        } else {
            // Pas de note/page sélectionnée
        }
    } catch (err) {
        console.error("Erreur saveCurrent:", err.message);
    }
}

function clearEditor() {
    editMode = null;
    selectedNoteId = null;
    selectedPageId = null;
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    editorTitle.textContent = "";
    editorContent.textContent = "";
    updateHierarchyPath();
    showEmptyState(true);
}

/****************************
 * 5) AFFICHAGE DU CHEMIN
 ****************************/
async function updateHierarchyPath() {
    const pathDiv = document.getElementById("hierarchyPath");
    pathDiv.innerHTML = "";

    const createPathElement = (text, type) => {
        const span = document.createElement("span");
        span.className = `${type}-path`;
        span.textContent = text;
        return span;
    };

    try {
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

        if (selectedNoteId) {
            const { data: note } = await supabase
                .from("notes")
                .select("title")
                .eq("id", selectedNoteId)
                .single();
            pathDiv.appendChild(createPathElement(note?.title || "Note", "note"));
        }

        if (selectedPageId) {
            const { data: page } = await supabase
                .from("pages")
                .select("title")
                .eq("id", selectedPageId)
                .single();
            pathDiv.appendChild(createPathElement(page?.title || "Page", "page"));
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour du chemin:", error);
    }
}

/****************************
 * 6) Auto-sauvegarde
 ****************************/
// Petite fonction debounce
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

function setupAutoSave() {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    const autoSave = debounce(async () => {
        // On ne sauvegarde que si on édite une note ou page existante
        if (editMode && (selectedNoteId || selectedPageId)) {
            await saveCurrent();
        }
    }, 1000);

    editorTitle.addEventListener("input", autoSave);
    editorContent.addEventListener("input", autoSave);
}

/****************************
 * 7) Gérer l'état vide (empty state)
 ****************************/
function showEmptyState(show) {
    const emptyStateDiv = document.getElementById("emptyState");
    const editorPanel = document.getElementById("editorPanel");

    if (!emptyStateDiv || !editorPanel) return;

    if (show) {
        // Affiche l'état vide, masque l'éditeur
        emptyStateDiv.style.opacity = 1;
        emptyStateDiv.style.pointerEvents = "auto";
        editorPanel.style.opacity = 0.3;
        editorPanel.style.pointerEvents = "none";
    } else {
        // Masque l'état vide
        emptyStateDiv.style.opacity = 0;
        emptyStateDiv.style.pointerEvents = "none";
        editorPanel.style.opacity = 1;
        editorPanel.style.pointerEvents = "auto";
    }
}
