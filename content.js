// content.js - Main filtering logic that runs on web pages

class TextFilter {
    constructor() {
        this.wordReplacements = {};
        this.processedElements = new WeakSet();
        this.init();
    }

    async init() {
        // Load settings from storage
        await this.loadSettings();
        
        // Start monitoring for text inputs
        this.setupInputMonitoring();
        
        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.wordReplacements) {
                this.wordReplacements = changes.wordReplacements.newValue || {};
                console.log('Word replacements updated:', this.wordReplacements);
            }
        });
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['wordReplacements'], (result) => {
                this.wordReplacements = result.wordReplacements || {};
                console.log('AI Text Filter loaded on:', window.location.href);
                console.log('Word replacements:', this.wordReplacements);
                resolve();
            });
        });
    }

    setupInputMonitoring() {
        // Monitor existing inputs
        this.monitorExistingInputs();
        
        // Monitor for new inputs added dynamically
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.monitorNewElements(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    monitorExistingInputs() {
        // Cast a wider net to catch all possible text inputs
        const inputs = document.querySelectorAll(`
            input[type="text"], 
            input[type="email"], 
            input:not([type]), 
            textarea, 
            [contenteditable="true"],
            [contenteditable=""],
            div[role="textbox"],
            div[data-testid*="input"],
            div[class*="input"],
            div[class*="text"],
            p[contenteditable="true"]
        `);
        console.log('Found', inputs.length, 'inputs to monitor');
        console.log('Input elements:', inputs);
        inputs.forEach(input => this.attachInputListener(input));
    }

    monitorNewElements(element) {
        // Check if the element itself is an input
        if (this.isInputElement(element)) {
            this.attachInputListener(element);
        }
        
        // Check for inputs within the element - wider search
        const inputs = element.querySelectorAll(`
            input[type="text"], 
            input[type="email"], 
            input:not([type]), 
            textarea, 
            [contenteditable="true"],
            [contenteditable=""],
            div[role="textbox"],
            div[data-testid*="input"],
            div[class*="input"],
            div[class*="text"],
            p[contenteditable="true"]
        `);
        inputs.forEach(input => this.attachInputListener(input));
    }

    isInputElement(element) {
        const tagName = element.tagName.toLowerCase();
        return (tagName === 'input' && (element.type === 'text' || element.type === 'email' || !element.type)) ||
               tagName === 'textarea' ||
               element.contentEditable === 'true' ||
               element.contentEditable === '' ||
               element.getAttribute('role') === 'textbox' ||
               element.hasAttribute('data-testid') && element.getAttribute('data-testid').includes('input');
    }

    attachInputListener(input) {
        if (this.processedElements.has(input)) {
            return; // Already processed
        }

        this.processedElements.add(input);
        console.log('Attached listener to input:', input.tagName, input.type, input.className);

        // Handle regular inputs and textareas
        if (input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea') {
            // Listen for input events
            input.addEventListener('input', (e) => {
                console.log('Input event triggered on:', e.target);
                this.filterInputText(e.target);
            });
            
            // Listen for paste events
            input.addEventListener('paste', (e) => {
                setTimeout(() => this.filterInputText(e.target), 10);
            });
            
            // Listen for keyup events (in case input event doesn't fire)
            input.addEventListener('keyup', (e) => {
                this.filterInputText(e.target);
            });
        } else {
            // Handle contenteditable elements and other complex inputs
            input.addEventListener('input', (e) => {
                console.log('Input event triggered on contenteditable:', e.target);
                this.filterContentEditableText(e.target);
            });
            
            input.addEventListener('paste', (e) => {
                setTimeout(() => this.filterContentEditableText(e.target), 10);
            });
            
            input.addEventListener('keyup', (e) => {
                this.filterContentEditableText(e.target);
            });
            
            // Only add MutationObserver for contenteditable elements
            if (input.isContentEditable) {
                const observer = new MutationObserver((mutations) => {
                    // Debounce to avoid excessive calls
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.filterContentEditableText(input);
                    }, 100);
                });
        
                observer.observe(input, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }
    }

    filterInputText(input) {
        if (!input.value || Object.keys(this.wordReplacements).length === 0) {
            return;
        }

        let originalText = input.value;
        let filteredText = originalText;
        let hasChanges = false;
        const cursorPosition = input.selectionStart;
        let newCursorPosition = cursorPosition;

        // Go through each word-replacement pair
        Object.keys(this.wordReplacements).forEach(word => {
            if (word.trim()) {
                const regex = new RegExp(`\\b${this.escapeRegExp(word)}(?=\\b|\\s|$)`, 'gi');
                const replacement = this.wordReplacements[word] || '[REDACTED]';
                
                let match;
                let offset = 0; // Track cumulative offset from replacements
                
                // Reset regex to start from beginning
                regex.lastIndex = 0;
                
                while ((match = regex.exec(originalText)) !== null) {
                    const matchStart = match.index + offset;
                    const matchEnd = matchStart + word.length;
                    
                    // Adjust cursor position if it's affected by this replacement
                    if (cursorPosition >= matchStart && cursorPosition <= matchEnd) {
                        // Cursor is within or at the matched word, place it at the end of replacement
                        newCursorPosition = matchStart + replacement.length;
                    } else if (cursorPosition > matchEnd) {
                        // Cursor is after the matched word, adjust by length difference
                        newCursorPosition += (replacement.length - word.length);
                    }
                    
                    // Perform the replacement
                    filteredText = filteredText.substring(0, matchStart) + 
                                  replacement + 
                                  filteredText.substring(matchEnd);
                    
                    // Update offset for next iteration
                    offset += (replacement.length - word.length);
                    hasChanges = true;
                    
                    console.log(`Replaced "${word}" with "${replacement}"`);
                    
                    // Reset regex to continue searching from after current replacement
                    regex.lastIndex = match.index + 1;
                }
            }
        });

        if (hasChanges) {
            input.value = filteredText;
            
            // Ensure cursor position is within bounds
            const finalCursorPosition = Math.min(Math.max(0, newCursorPosition), filteredText.length);
            input.setSelectionRange(finalCursorPosition, finalCursorPosition);
            
            // Trigger input event to notify any listeners
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            console.log('Text filtered in input:', filteredText);
            console.log('Cursor moved to position:', finalCursorPosition);
        }
    }

    filterContentEditableText(element) {
        let textContent = element.textContent || element.innerText || '';
        if (!textContent || Object.keys(this.wordReplacements).length === 0) {
            return;
        }

        console.log('Filtering contenteditable text:', textContent);
        let filteredText = textContent;
        let hasChanges = false;

        // Go through each word-replacement pair
        Object.keys(this.wordReplacements).forEach(word => {
            if (word.trim()) {
                const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
                const replacement = this.wordReplacements[word] || '[REDACTED]';

                if (regex.test(filteredText)) {
                    filteredText = filteredText.replace(regex, replacement);
                    hasChanges = true;
                    console.log(`Replaced "${word}" with "${replacement}" in contenteditable`);
                }
            }
        });

        if (hasChanges) {
            // Save cursor position
            const selection = window.getSelection();
            let cursorOffset = 0;
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                cursorOffset = range.startOffset;
            }
            
            // Update text content
            if (element.textContent !== undefined) {
                element.textContent = filteredText;
            } else {
                element.innerText = filteredText;
            }
            
            // Trigger input event to notify any listeners
            element.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Restore cursor position
            try {
                const newRange = document.createRange();
                const textNode = element.firstChild || element;
                const maxOffset = textNode.textContent ? textNode.textContent.length : 0;
                newRange.setStart(textNode, Math.min(cursorOffset, maxOffset));
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } catch (e) {
                console.log('Could not restore cursor position:', e);
            }
            
            console.log('Text filtered in contenteditable:', filteredText);
        }
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Initialize the filter when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new TextFilter();
    });
} else {
    new TextFilter();
}