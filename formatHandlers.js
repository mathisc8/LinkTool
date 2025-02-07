const FormatHandlers = {
    init() {
        this.setupKeyboardShortcuts();
        this.setupFormatButtons();
        this.setupPasteHandler();
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.applyFormat('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.applyFormat('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        this.applyFormat('underline');
                        break;
                }
            }
        });
    },

    setupFormatButtons() {
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                if (format) {
                    this.applyFormat(format);
                }
            });
        });
    },

    setupPasteHandler() {
        const editor = document.getElementById('editorContent');
        if (editor) {
            editor.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
            });
        }
    },

    applyFormat(format) {
        switch (format) {
            case 'h1':
            case 'h2':
            case 'h3':
                document.execCommand('formatBlock', false, `<${format}>`);
                break;
            case 'insertUnorderedList':
            case 'insertOrderedList':
                document.execCommand(format, false, null);
                break;
            case 'insertCheckList':
                this.insertCheckList();
                break;
            default:
                document.execCommand(format, false, null);
        }
        this.updateFormatButtons();
    },

    insertCheckList() {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        li.innerHTML = '<input type="checkbox"> ';

        const ul = document.createElement('ul');
        ul.className = 'checklist';
        ul.appendChild(li);

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        range.insertNode(ul);

        // Place cursor after checkbox
        range.setStartAfter(li.firstChild);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    },

    updateFormatButtons() {
        document.querySelectorAll('.format-btn').forEach(btn => {
            const format = btn.dataset.format;
            if (['bold', 'italic', 'underline'].includes(format)) {
                btn.classList.toggle('active', document.queryCommandState(format));
            }
        });
    }
};

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => FormatHandlers.init());
