// popup.js - Extension popup functionality

document.addEventListener('DOMContentLoaded', function() {
    const wordInput = document.getElementById('wordInput');
    const replacementInput = document.getElementById('replacementInput');
    const addWordBtn = document.getElementById('addWord');
    const clearAllBtn = document.getElementById('clearAll');
    const wordList = document.getElementById('wordList');
    const status = document.getElementById('status');

    // Load existing data when popup opens
    loadWordList();

    // Add word-replacement pair
    addWordBtn.addEventListener('click', function() {
        const word = wordInput.value.trim();
        const replacement = replacementInput.value.trim() || '[REDACTED]';
        
        if (word) {
            addWordToList(word, replacement);
            wordInput.value = '';
            replacementInput.value = '';
        } else {
            showStatus('Please enter a word to filter', 'error');
        }
    });

    // Clear all words
    clearAllBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all filtered words?')) {
            chrome.storage.local.set({wordReplacements: {}}, function() {
                loadWordList();
                showStatus('All words cleared', 'success');
            });
        }
    });

    // Allow Enter key to add words
    wordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addWordBtn.click();
        }
    });

    replacementInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addWordBtn.click();
        }
    });

    function addWordToList(word, replacement) {
        chrome.storage.local.get(['wordReplacements'], function(result) {
            let wordReplacements = result.wordReplacements || {};
            
            // Check if word already exists (case-insensitive)
            const existingWord = Object.keys(wordReplacements).find(w => 
                w.toLowerCase() === word.toLowerCase()
            );
            
            if (existingWord) {
                // Update existing word
                wordReplacements[existingWord] = replacement;
                showStatus('Word updated successfully!', 'success');
            } else {
                // Add new word
                wordReplacements[word] = replacement;
                showStatus('Word added successfully!', 'success');
            }
            
            chrome.storage.local.set({wordReplacements: wordReplacements}, function() {
                loadWordList();
            });
        });
    }

    function loadWordList() {
        chrome.storage.local.get(['wordReplacements'], function(result) {
            const wordReplacements = result.wordReplacements || {};
            displayWordList(wordReplacements);
        });
    }

    function displayWordList(wordReplacements) {
        const words = Object.keys(wordReplacements);
        
        if (words.length === 0) {
            wordList.innerHTML = '<div style="text-align: center; color: #666;">No words added yet</div>';
            return;
        }

        wordList.innerHTML = words.map(word => `
            <div class="word-item">
                <div class="word-info">
                    <div class="word-text">${escapeHtml(word)}</div>
                    <div class="replacement-text">→ ${escapeHtml(wordReplacements[word])}</div>
                </div>
                <button class="delete-btn" onclick="deleteWord('${escapeHtml(word)}')">Delete</button>
            </div>
        `).join('');
    }

    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Make deleteWord function global so it can be called from HTML
    window.deleteWord = function(word) {
        chrome.storage.local.get(['wordReplacements'], function(result) {
            let wordReplacements = result.wordReplacements || {};
            delete wordReplacements[word];
            chrome.storage.local.set({wordReplacements: wordReplacements}, function() {
                loadWordList();
                showStatus('Word deleted', 'success');
            });
        });
    };
});