const supabaseUrl = "https://qnqkizhwtwsptqnayfpd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucWtpemh3dHdzcHRxbmF5ZnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4NTE3ODYsImV4cCI6MjA1MjQyNzc4Nn0.oP5hXVIo1bAGLCYcqEOIEpyFZNhaQ43eNsvU9i_Qq6Q";


// Exemple : initialiser le client Supabase (si vous utilisez le package @supabase/supabase-js)
// const { createClient } = require('@supabase/supabase-js');
// const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Vérifier si l'utilisateur est déjà connecté
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && window.location.pathname.includes('login.html')) {
        window.location.href = 'index.html';
    } else if (!user && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Event listeners pour l'authentification
    const loginForm = document.getElementById('loginForm');
    const googleBtn = document.getElementById('googleLogin');
    const githubBtn = document.getElementById('githubLogin');
    const signupBtn = document.getElementById('signupButton');
    const authMessage = document.querySelector('.auth-message');

    // Fonction pour afficher les messages
    function showMessage(message, isError = false) {
        authMessage.textContent = message;
        authMessage.className = `auth-message ${isError ? 'error' : 'success'}`;
        authMessage.hidden = false;
    }

    // Connexion email/password
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            window.location.href = 'index.html';
        } catch (error) {
            showMessage(error.message, true);
        }
    });

    // Connexion avec Google
    googleBtn?.addEventListener('click', async () => {
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/index.html`
                }
            });

            if (error) throw error;
        } catch (error) {
            showMessage(error.message, true);
        }
    });

    // Connexion avec GitHub
    githubBtn?.addEventListener('click', async () => {
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: `${window.location.origin}/index.html`
                }
            });

            if (error) throw error;
        } catch (error) {
            showMessage(error.message, true);
        }
    });

    // Création de compte
    signupBtn?.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showMessage('Please enter email and password', true);
            return;
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            showMessage('Account created! Please check your email to confirm your account.');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
});

// Écouter les changements d'état d'authentification
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        window.location.href = 'index.html';
    } else if (event === 'SIGNED_OUT') {
        window.location.href = 'login.html';
    }
});
