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

// Liste des notes du Notebook sélectionné (pour éviter de recharger en permanence)
let currentNotes = [];

/****************************
 * Navigation (exemple)
 ****************************/
function goHome() {
    // Par exemple : rediriger vers une page d'accueil
    window.location.href = "accueil.html";
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
 * Vérification de l'authentification
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

/****************************
 * Au chargement : initialisation
 ****************************/
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Vérifier l'authentification
    if (!await checkAuth()) return;

    // 2. Initialiser le thème
    initTheme();

    // 3. Charger la liste des Notebooks
    await loadNotebooks();

    // 4. Mettre en place l'auto-sauvegarde (notes/pages)
    setupAutoSave();

    // 5. Event listener pour le toggle du thème
    document
        .getElementById("themeToggle")
        ?.addEventListener("click", toggleTheme);

    // 6. Afficher "No selection" au départ
    showEmptyState(true);

    // 7. Ajouter les gestionnaires d'événements pour le formatage
    document.querySelectorAll('.format-btn').forEach(btn => {
        const format = btn.dataset.format;
        if (format !== 'insertImage') {
            btn.addEventListener('click', () => applyFormat(format));
        }
    });

    // 8. Gestion des images (upload + insertion + suppression)
    setupImageHandling();

    // 9. Ajouter des écouteurs pour mettre à jour l'état des boutons de format
    const editorContent = document.getElementById('editorContent');
    if (editorContent) {
        editorContent.addEventListener('keyup', updateFormatButtonStates);
        editorContent.addEventListener('mouseup', updateFormatButtonStates);
    }
});

/****************************
 * 1) GESTION DES NOTEBOOKS
 ****************************/
async function loadNotebooks() {
    try {
        const { data, error } = await supabase
            .from("notebooks")
            .select("*")
            .eq('user_id', currentUserId)
            .order("name", { ascending: true });

        if (error) throw error;

        const listDiv = document.getElementById("notebooksList");
        listDiv.innerHTML = "";

        data.forEach((notebook) => {
            const notebookEl = document.createElement("div");
            notebookEl.className = "notebook-item";

            notebookEl.innerHTML = `
                <div class="notebook-title ${notebook.id === selectedNotebookId ? "active" : ""}" 
                     data-notebook-id="${notebook.id}">
                  <div class="notebook-title-left">
                    <i class="fas ${notebook.id === selectedNotebookId ? "fa-book-open" : "fa-book"}"></i>
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

            // Clic sur le titre => sélection du Notebook
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
                    if (confirm(`Voulez-vous vraiment supprimer le Notebook "${notebook.name}" ?`)) {
                        await deleteNotebook(notebook.id);
                    }
                });

            listDiv.appendChild(notebookEl);
        });

        // Si un notebook est déjà sélectionné, recharger la liste de ses notes
        if (selectedNotebookId) {
            await loadNotes(selectedNotebookId);
        }
    } catch (err) {
        console.error("Erreur loadNotebooks:", err.message);
    }
}

function selectNotebook(notebookId) {
    // Mise à jour visuelle
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

    // Charger les notes du Notebook sélectionné
    loadNotes(notebookId);

    // Réinitialiser la liste des pages (plus aucune note sélectionnée)
    loadPages(null);

    updateHierarchyPath();
    // On met l'éditeur en "vide" en attendant qu'une note soit sélectionnée
    showEmptyState(true);
}

async function createNotebook() {
    const name = prompt("Nom du Notebook :");
    if (!name) return;

    try {
        const newNotebook = {
            id: crypto.randomUUID(),
            name,
            user_id: currentUserId
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
        // Supprimer d'abord toutes les notes/pages associées 
        // si pas de cascade dans la DB (ou si vous préférez un cascade en base, c'est au choix)

        // Supprime le Notebook
        const { error } = await supabase
            .from("notebooks")
            .delete()
            .eq("id", notebookId);

        if (error) throw error;

        // Si c'était le notebook sélectionné
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
            .eq("user_id", currentUserId)
            .order("last_modified", { ascending: false });

        if (error) throw error;

        currentNotes = data || [];
        const notesListDiv = document.getElementById("notesList");
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
            li.className = note.id === selectedNoteId ? 'active' : '';
            li.dataset.noteId = note.id;
            li.innerHTML = `
                <div class="note-content">
                    <span class="note-title">${note.title || "(Sans titre)"}</span>
                </div>
                <div class="actions">
                    <button class="action-btn delete-btn" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Clic sur toute la zone de la note => sélection
            li.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    selectNote(note.id);
                }
            });

            // Clic sur le bouton "Supprimer"
            li.querySelector(".delete-btn").addEventListener('click', async (e) => {
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
    const note = currentNotes.find(n => n.id === noteId);
    if (!note) return;

    // Mise à jour de la sélection visuelle
    document.querySelectorAll('#notesList li').forEach(li => {
        li.classList.toggle('active', li.dataset.noteId === noteId);
    });

    selectedNoteId = noteId;
    selectedPageId = null;
    editMode = "note";

    // Afficher contenu de la note dans l'éditeur
    showInEditor(note.title, note.content);

    // Charger les pages associées
    loadPages(noteId);

    updateHierarchyPath();
    showEmptyState(false);
}

async function createNote() {
    if (!selectedNotebookId) {
        alert("Sélectionne d'abord un Notebook !");
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
        user_id: currentUserId
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
        const pagesListDiv = document.getElementById("pagesList");
        if (!noteId) {
            // Si pas de note sélectionnée, on vide la liste des pages
            pagesListDiv.innerHTML = `
                <div class="empty-state" 
                     style="position:static; border-radius:var(--radius-sm); height:auto; opacity:1; pointer-events:auto;">
                    <i class="fas fa-file-alt"></i>
                    <p>Sélectionnez une note pour voir ses pages</p>
                </div>
            `;
            return;
        }

        const { data, error } = await supabase
            .from("pages")
            .select("*")
            .eq("note_id", noteId)
            .eq("user_id", currentUserId)
            .order("last_modified", { ascending: false });

        if (error) throw error;

        pagesListDiv.innerHTML = "";

        if (!data || data.length === 0) {
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

        data.forEach((page) => {
            const li = document.createElement("li");
            li.className = page.id === selectedPageId ? 'active' : '';
            li.dataset.pageId = page.id;
            li.innerHTML = `
                <div class="page-content">
                    <span class="page-title">${page.title || "(Sans titre)"}</span>
                </div>
                <div class="actions">
                    <button class="action-btn delete-btn" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Clic sur la zone de la page => sélectionner la page
            li.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    selectPage(page);
                }
            });

            // Clic sur bouton "Supprimer"
            li.querySelector(".delete-btn").addEventListener('click', async (e) => {
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

    // Mise à jour de la sélection visuelle
    document.querySelectorAll('#pagesList li').forEach(li => {
        li.classList.toggle('active', li.dataset.pageId === page.id);
    });

    // Afficher le contenu complet de la page dans l'éditeur
    showInEditor(page.title, page.content || '');
    updateHierarchyPath();
    showEmptyState(false);
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
        user_id: currentUserId
    };

    try {
        const { data, error } = await supabase
            .from("pages")
            .insert([newPage])
            .select()
            .single();

        if (error) throw error;

        // Recharger les pages
        await loadPages(selectedNoteId);

        // Sélectionner automatiquement la nouvelle page
        if (data) {
            selectPage(data);
        }
    } catch (err) {
        console.error("Erreur createPage:", err.message);
        showToast("Erreur lors de la création de la page", "error");
    }
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
 * 4) ÉDITEUR (Note ou Page)
 ****************************/
function showInEditor(title, content) {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    if (editorTitle && editorContent) {
        editorTitle.textContent = title || "";

        // Nettoyage éventuel du contenu HTML
        if (content) {
            const sanitizedContent = DOMPurify.sanitize(content, {
                ALLOWED_TAGS: [
                    'div', 'br', 'p', 'strong', 'em', 'u',
                    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'img', 'span'
                ],
                ALLOWED_ATTR: ['src', 'alt', 'style', 'class', 'data-*']
            });
            editorContent.innerHTML = sanitizedContent;

            // Réattacher les listeners sur les images existantes
            editorContent.querySelectorAll('.image-wrapper').forEach(wrapper => {
                attachImageListeners(wrapper);
            });
        } else {
            editorContent.innerHTML = '';
        }

        editorTitle.contentEditable = "true";
        editorContent.contentEditable = "true";
    }
}

async function saveCurrent() {
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
}

/****************************
 * 5) AFFICHAGE DU CHEMIN (HierarchyPath)
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

            pathDiv.appendChild(
                createPathElement(note?.title || "Note", "note")
            );
        }

        // Page
        if (selectedPageId) {
            const { data: page } = await supabase
                .from("pages")
                .select("title")
                .eq("id", selectedPageId)
                .single();

            pathDiv.appendChild(
                createPathElement(page?.title || "Page", "page")
            );
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour du chemin:", error);
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

function setupAutoSave() {
    const editorTitle = document.getElementById("editorTitle");
    const editorContent = document.getElementById("editorContent");

    const autoSave = debounce(async () => {
        if (editMode && (selectedNoteId || selectedPageId)) {
            await saveCurrent();
        }
    }, 1000);

    if (editorTitle) editorTitle.addEventListener("input", autoSave);
    if (editorContent) editorContent.addEventListener("input", autoSave);
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
    document.execCommand(command, false, value);
    updateFormatButtonStates();
}

function updateFormatButtonStates() {
    document.querySelectorAll('.format-btn').forEach(btn => {
        const format = btn.dataset.format;
        if (['bold', 'italic', 'underline'].includes(format)) {
            btn.classList.toggle('active', document.queryCommandState(format));
        }
    });
}

/****************************
 * 9) GESTION DES IMAGES
 ****************************/
async function uploadImage(file) {
    try {
        // Nom de fichier unique
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${currentUserId}/${fileName}`;

        // Upload vers le bucket "notes-images"
        const { data, error } = await supabase.storage
            .from('notes-images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (error) throw error;

        // Récupérer l'URL publique
        const { data: { publicUrl } } = supabase.storage
            .from('notes-images')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (error) {
        console.error('Erreur upload image:', error);
        throw error;
    }
}

function setupImageHandling() {
    const imageBtn = document.querySelector('[data-format="insertImage"]');
    const imageInput = document.getElementById('imageInput');

    if (!imageBtn || !imageInput) return;

    // Clic sur le bouton d'insertion d'image
    imageBtn.addEventListener('click', () => {
        imageInput.click();
    });

    // Changement dans l'input file
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Vérification du format
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            alert('Format d\'image non supporté. Utilisez JPG, PNG, GIF ou WebP.');
            return;
        }

        // Vérification de la taille (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            alert('L\'image ne doit pas dépasser 5MB.');
            return;
        }

        // Indicateur de chargement
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload en cours...';
        document.body.appendChild(loadingIndicator);

        try {
            // Upload
            const publicUrl = await uploadImage(file);

            // Insertion dans l'éditeur
            if (publicUrl) {
                insertImage(publicUrl);
                await saveCurrent();
                showToast('Image uploadée avec succès', 'success');
            }
        } catch (error) {
            console.error('Erreur lors du chargement de l\'image:', error);
            showToast('Erreur lors de l\'upload de l\'image', 'error');
        } finally {
            // Retirer l'indicateur
            loadingIndicator.remove();
            imageInput.value = '';
        }
    });
}

function insertImage(src) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.contentEditable = 'false';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Image insérée';
    img.style.maxWidth = '100%';

    wrapper.appendChild(img);

    // Actions sur l'image
    wrapper.innerHTML += `
        <div class="image-actions">
            <button class="image-action-btn delete-img" title="Supprimer l'image">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    attachImageListeners(wrapper);

    // Insérer le wrapper dans l'éditeur à l'emplacement du curseur
    range.insertNode(wrapper);
    range.collapse(false);

    // Sauvegarde automatique après insertion
    saveCurrent();
}

function attachImageListeners(wrapper) {
    const deleteBtn = wrapper.querySelector('.delete-img');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const img = wrapper.querySelector('img');
            if (img && img.src) {
                try {
                    // Récupérer le nom de fichier à partir de l'URL
                    const fileUrl = new URL(img.src);
                    const fileName = fileUrl.pathname.split('/').pop();
                    if (fileName) {
                        // Supprimer du stockage
                        await supabase.storage
                            .from('notes-images')
                            .remove([`${currentUserId}/${fileName}`]);
                    }
                    // Retirer du DOM
                    wrapper.remove();
                    saveCurrent();
                } catch (error) {
                    console.error('Erreur lors de la suppression:', error);
                    showToast('Erreur lors de la suppression de l\'image', 'error');
                }
            }
        });
    }

    // Permettre un redimensionnement simple (ex : Ctrl + clic)
    const img = wrapper.querySelector('img');
    if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                const newSize = prompt('Entrez la largeur en % (10-100)', '100');
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
    // Implémentez ici votre système de notification/toast
    // Par exemple : un petit DIV qui apparaît en haut à droite
    console.log(`[${type.toUpperCase()}] ${message}`);
}
