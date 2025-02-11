class SearchHandler {
    constructor() {
        this.searchTypes = {
            ALL: 'all',
            NOTEBOOKS: 'notebooks',
            NOTES: 'notes',
            PAGES: 'pages'
        };
        this.currentFilter = 'all';
        this.searchDebounceTimer = null;
        this.init();
    }

    init() {
        this.searchInput = document.querySelector('.header-search input');
        this.searchControls = document.querySelector('.search-controls');
        this.searchCount = document.createElement('div');
        this.searchCount.className = 'search-count';

        // Insérer le compteur après les contrôles de recherche
        this.searchControls?.parentNode.insertBefore(this.searchCount, this.searchControls.nextSibling);

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Gestionnaire de recherche avec debounce
        this.searchInput?.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 300);
        });

        // Gestionnaire des boutons de filtre
        document.querySelectorAll('.search-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.search-type-btn').forEach(b =>
                    b.classList.remove('active')
                );
                btn.classList.add('active');
                this.currentFilter = btn.dataset.searchType;
                this.performSearch(this.searchInput.value);
            });
        });
    }

    async performSearch(query) {
        if (!query) {
            this.resetSearch();
            return;
        }

        const term = query.toLowerCase().trim();
        try {
            const results = await this.searchInSupabase(term);
            this.displayResults(results, term);
        } catch (error) {
            console.error('Erreur de recherche:', error);
            showToast('Erreur lors de la recherche', 'error');
        }
    }

    async searchInSupabase(term) {
        const results = {
            notebooks: [],
            notes: [],
            pages: []
        };

        const queries = [];

        // Recherche dans les notebooks si nécessaire
        if (this.currentFilter === 'all' || this.currentFilter === 'notebooks') {
            queries.push(
                supabase.from('notebooks')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .ilike('name', `%${term}%`)
            );
        }

        // Recherche dans les notes si nécessaire
        if (this.currentFilter === 'all' || this.currentFilter === 'notes') {
            queries.push(
                supabase.from('notes')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
            );
        }

        // Recherche dans les pages si nécessaire
        if (this.currentFilter === 'all' || this.currentFilter === 'pages') {
            queries.push(
                supabase.from('pages')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
            );
        }

        const responses = await Promise.all(queries);

        // Assigner les résultats au bon type
        responses.forEach(response => {
            if (response.error) throw response.error;
            if (response.data[0]) {
                // Déterminer le type basé sur la structure des données
                if ('name' in response.data[0]) {
                    results.notebooks = response.data;
                } else if ('notebook_id' in response.data[0]) {
                    results.notes = response.data;
                } else {
                    results.pages = response.data;
                }
            }
        });

        return results;
    }

    displayResults(results, term) {
        const total = Object.values(results).reduce((acc, curr) => acc + curr.length, 0);
        this.searchCount.textContent = `${total} résultat${total > 1 ? 's' : ''}`;
        this.searchCount.style.display = 'block';

        // Afficher les résultats selon le filtre actif
        if (this.currentFilter === 'all' || this.currentFilter === 'notebooks') {
            this.updateNotebooksList(results.notebooks, term);
        }
        if (this.currentFilter === 'all' || this.currentFilter === 'notes') {
            this.updateNotesList(results.notes, term);
        }
        if (this.currentFilter === 'all' || this.currentFilter === 'pages') {
            this.updatePagesList(results.pages, term);
        }
    }

    updateNotebooksList(notebooks, term) {
        const notebooksList = document.getElementById('notebooksList');
        if (!notebooksList) return;

        if (!notebooks.length) {
            notebooksList.innerHTML = this.getEmptyStateHTML('notebooks');
            return;
        }

        notebooksList.innerHTML = notebooks.map(notebook => `
            <div class="notebook-item search-result">
                <div class="notebook-title" data-notebook-id="${notebook.id}">
                    <div class="notebook-title-left">
                        <i class="fas fa-book"></i>
                        <span class="notebook-name">${this.highlightTerm(notebook.name, term)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        // Réattacher les événements
        notebooksList.querySelectorAll('.notebook-title').forEach(title => {
            title.addEventListener('click', () => selectNotebook(title.dataset.notebookId));
        });
    }

    updateNotesList(notes, term) {
        const notesList = document.getElementById('notesList');
        if (!notesList) return;

        if (!notes.length) {
            notesList.innerHTML = this.getEmptyStateHTML('notes');
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'item-list';

        notes.forEach(note => {
            const li = document.createElement('li');
            li.className = 'search-result';
            li.innerHTML = `
                <div class="note-content">
                    <span class="note-title">${this.highlightTerm(note.title || '(Sans titre)', term)}</span>
                    ${note.content ? `<div class="note-preview">${this.highlightTerm(this.truncateContent(note.content), term)}</div>` : ''}
                </div>
            `;
            li.addEventListener('click', () => selectNote(note.id));
            ul.appendChild(li);
        });

        notesList.innerHTML = '';
        notesList.appendChild(ul);
    }

    updatePagesList(pages, term) {
        const pagesList = document.getElementById('pagesList');
        if (!pagesList) return;

        if (!pages.length) {
            pagesList.innerHTML = this.getEmptyStateHTML('pages');
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'item-list';

        pages.forEach(page => {
            const li = document.createElement('li');
            li.className = 'search-result';
            li.innerHTML = `
                <div class="page-content">
                    <span class="page-title">${this.highlightTerm(page.title || '(Sans titre)', term)}</span>
                    ${page.content ? `<div class="page-preview">${this.highlightTerm(this.truncateContent(page.content), term)}</div>` : ''}
                </div>
            `;
            li.addEventListener('click', () => selectPage(page));
            ul.appendChild(li);
        });

        pagesList.innerHTML = '';
        pagesList.appendChild(ul);
    }

    getEmptyStateHTML(type) {
        return `
            <div class="empty-state" style="position:static; height:auto;">
                <i class="fas fa-search"></i>
                <p>Aucun ${type} trouvé</p>
            </div>
        `;
    }

    highlightTerm(text, term) {
        if (!term) return text;
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    truncateContent(content) {
        return content.replace(/<[^>]*>/g, '').slice(0, 100) + '...';
    }

    resetSearch() {
        this.searchCount.style.display = 'none';
        loadNotebooks();
        if (selectedNotebookId) loadNotes(selectedNotebookId);
        if (selectedNoteId) loadPages(selectedNoteId);
    }
}

// Initialisation au chargement de la page
const searchHandler = new SearchHandler();
