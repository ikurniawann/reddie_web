/* 
   REDDIE WEBSITE INTERACTION SCRIPTS
   Handles scroll spy navigation, smooth-scrolling, URL history management,
   interactive SaaS Dashboard AI chatbot simulation, and contact form validation.
   Features dynamic sidebar click listeners to switch middle column stats 
   and themed chatbot panels on the fly, with fully clickable demo buttons!
*/

document.addEventListener('DOMContentLoaded', () => {
    setupIntersectionObserver();
    setupSmoothScrolling();
    setupContactForm();
    setupDashboardDemo();
});

// IntersectionObserver to sync vertical scroll position with header links
function setupIntersectionObserver() {
    const sections = document.querySelectorAll('.page-section');
    const navLinks = document.querySelectorAll('.nav-link');
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

    const observerOptions = {
        root: null,
        rootMargin: '-40% 0px -40% 0px', // Triggers when section occupies middle 20% of viewport
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const sectionId = entry.target.getAttribute('id');
                const targetPage = sectionId.replace('section-', '');

                navLinks.forEach(link => {
                    if (link.getAttribute('data-target') === targetPage) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });

                mobileNavItems.forEach(item => {
                    if (item.getAttribute('data-target') === targetPage) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => {
        observer.observe(section);
    });
}

// Smooth scrolling transition handlers for nav link click events
function setupSmoothScrolling() {
    document.querySelectorAll('.nav-link, .mobile-nav-item, .btn-primary, .btn-secondary').forEach(link => {
        link.addEventListener('click', (e) => {
            const targetHash = link.getAttribute('href');
            if (targetHash && targetHash.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(targetHash);
                
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Update hash in URL bar without default scroll jumping
                    history.pushState(null, null, targetHash);
                }
                link.blur();
            }
        });
    });
    
    // Support deep-linking scroll on page load
    const initialHash = window.location.hash;
    if (initialHash) {
        const targetSection = document.querySelector(initialHash);
        if (targetSection) {
            setTimeout(() => {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 300);
        }
    }
}

// SaaS Dashboard Demo Simulation Engine
function setupDashboardDemo() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatWelcomeState = document.getElementById('chatWelcomeState');
    const chatConversation = document.getElementById('chatConversation');
    const chatViewport = document.getElementById('chatViewport');
    
    if (!chatInput || !sendBtn || !chatWelcomeState || !chatConversation || !chatViewport) return;
    
    let isGenerating = false;
    let chatTurnCount = 0; // Tracks how many user messages have been sent
    let activeTab = "Chat & Discussion"; // Current active sidebar tab

    // ── Custom in-page prompt (replaces browser prompt()) ────────────────────
    function showCustomPrompt(title, placeholder, defaultVal, onConfirm) {
        // Create overlay if not already in DOM
        var overlay = document.getElementById('customModalOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'customModalOverlay';
            overlay.className = 'custom-modal-overlay';
            overlay.innerHTML =
                '<div class="custom-modal-card">' +
                  '<div class="custom-modal-title" id="customModalTitle"></div>' +
                  '<input class="custom-modal-input" id="customModalInput" type="text">' +
                  '<div class="custom-modal-actions">' +
                    '<button class="custom-modal-cancel" id="customModalCancel">Cancel</button>' +
                    '<button class="custom-modal-confirm" id="customModalConfirm">Confirm</button>' +
                  '</div>' +
                '</div>';
            document.body.appendChild(overlay);
        }

        var titleEl   = document.getElementById('customModalTitle');
        var inputEl   = document.getElementById('customModalInput');
        var cancelBtn = document.getElementById('customModalCancel');
        var confirmBtn= document.getElementById('customModalConfirm');

        titleEl.textContent  = title;
        inputEl.value        = defaultVal || '';
        inputEl.placeholder  = placeholder || '';
        overlay.classList.add('active');
        setTimeout(function() { inputEl.focus(); inputEl.select(); }, 80);

        function close() {
            overlay.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick  = null;
            inputEl.onkeydown  = null;
        }
        confirmBtn.onclick = function() {
            var val = inputEl.value.trim();
            close();
            if (val) onConfirm(val);
        };
        cancelBtn.onclick = close;
        inputEl.onkeydown = function(e) {
            if (e.key === 'Enter') confirmBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };
        // Close on overlay click (outside card)
        overlay.onclick = function(e) { if (e.target === overlay) cancelBtn.click(); };
    }
    
    // Bind click events on Sidebar Menu Items
    const menuItems = document.querySelectorAll('.db-sidebar .menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            if (isGenerating) return;
            
            // 1. Update visual active state in sidebar
            menuItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            // 2. Extract selected menu text
            // data-key mengunci identitas menu; teksnya bebas diubah lewat CMS.
            let tabName = item.dataset.key ||
                item.childNodes[item.childNodes.length - 1].textContent.trim();
            if (item.classList.contains('menu-more')) {
                tabName = "And many more..";
            }
            activeTab = tabName;
            
            // 3. Reset chat interface back to welcome state
            chatConversation.innerHTML = '';
            chatConversation.style.display = 'none';
            chatWelcomeState.style.display = 'flex';
            
            // 4. Update the middle column and welcome chips dynamically
            updateDashboardContent(tabName);
        });
    });
    
    // Suggestion chips click triggers typing & automated sending
    window.bindChipClickListeners = bindChipClickListeners;
    function bindChipClickListeners() {
        const chips = document.querySelectorAll('.suggestion-chips .chip');
        chips.forEach(chip => {
            // Remove any old event listeners by replacing node
            const newChip = chip.cloneNode(true);
            chip.parentNode.replaceChild(newChip, chip);
            
            newChip.addEventListener('click', () => {
                if (isGenerating) return;
                const promptText = newChip.textContent.trim();
                chatInput.value = promptText;
                handleUserMessageSend();
            });
        });
    }
    
    // Initial binding of chips & buttons on load
    bindChipClickListeners();
    bindInteractiveStatsFeatures();
    bindAgentSelectorDropdown();
    
    function bindAgentSelectorDropdown() {
        const activeAgentBtn = document.getElementById('activeAgentBtn');
        const agentOpts = document.querySelectorAll('.agent-opt');
        const agentDropdown = activeAgentBtn ? activeAgentBtn.closest('.db-agent-dropdown') : null;

        if (!activeAgentBtn) return;

        // Toggle dropdown open/closed on tap (mobile-friendly)
        activeAgentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (agentDropdown) agentDropdown.classList.toggle('dropdown-open');
        });

        // Close dropdown when clicking/tapping anywhere outside
        document.addEventListener('click', () => {
            if (agentDropdown) agentDropdown.classList.remove('dropdown-open');
        });

        agentOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                // Close dropdown on selection
                if (agentDropdown) agentDropdown.classList.remove('dropdown-open');

                const agentName = opt.getAttribute('data-agent');

                // 1. Update dropdown active visual states
                agentOpts.forEach(el => el.classList.remove('active'));
                opt.classList.add('active');
                
                // 2. Update active button label
                activeAgentBtn.innerHTML = `<span class="status-dot"></span> ${agentName} <i class="fa-solid fa-chevron-down"></i>`;
                
                // 3. Clear chat conversation & reset back to welcome screen greeting the active agent
                chatConversation.innerHTML = '';
                chatConversation.style.display = 'none';
                chatWelcomeState.style.display = 'flex';
                
                // 4. Update welcome title/subtitle dynamically
                const welcomeTitle = chatWelcomeState.querySelector('.chat-welcome-title');
                const welcomeSubtitle = chatWelcomeState.querySelector('.chat-welcome-subtitle');
                if (welcomeTitle && welcomeSubtitle) {
                    if (agentName === 'Reddie') {
                        welcomeTitle.textContent = "Welcome, Mr. Stark!";
                        welcomeSubtitle.textContent = "How can I help you today?";
                    } else {
                        welcomeTitle.textContent = `Welcome, ${agentName}!`;
                        welcomeSubtitle.textContent = `I am loaded and ready. How can I help you today?`;
                    }
                }
                
                // 5. Append system notice in chat log
                appendMessage(`System Alert: Active agent workspace switched to ${agentName} AI.`, 'agent');
            });
        });
    }
    
    // Send button click trigger
    sendBtn.addEventListener('click', () => {
        handleUserMessageSend();
    });
    
    // Enter key press trigger in input field
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleUserMessageSend();
        }
    });
    
    // Diekspos supaya live.js bisa mengirim pesan dari panel (mis. klik
    // kartu berita) tanpa menduplikasi alur kirim yang sudah ada di sini.
    window.reddieSend = function (teks) {
        if (typeof teks === 'string' && teks.trim()) chatInput.value = teks.trim();
        handleUserMessageSend();
    };
    function handleUserMessageSend() {
        const queryText = chatInput.value.trim();
        if (!queryText || isGenerating) return;
        
        isGenerating = true;
        chatTurnCount++;
        chatInput.value = '';
        
        // Hide welcome state graphic and show message container on first query
        if (chatWelcomeState.style.display !== 'none') {
            chatWelcomeState.style.display = 'none';
            chatConversation.style.display = 'flex';
        }
        
        // 1. Render User Message
        appendMessage(queryText, 'user');
        
        // Disable inputs during simulation delay
        chatInput.disabled = true;
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        
        // 2. Render Typing indicator from Agent
        const typingIndicator = appendTypingIndicator();
        
        // 3. Jawaban: API nyata (multi-provider) dulu; mock hanya sebagai fallback
        function renderReply(responseText, fromMock) {
            typingIndicator.remove();
            const responseMsg = appendMessage('', 'agent');
            const bubble = responseMsg.querySelector('.msg-bubble');
            typewriterEffect(bubble, responseText, function() {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                chatInput.focus();
                isGenerating = false;
                // Kartu signup hanya relevan pada mode demo mock
                if (fromMock && chatTurnCount >= 2 && !document.getElementById('launchSignupCard')) {
                    setTimeout(appendLaunchSignupCard, 500);
                }
            });
        }
        
        if (window.REDDIE_API && window.REDDIE_API.ready) {
            window.REDDIE_API.chat(queryText)
                .then(function(d) { renderReply(d.reply, false); })
                .catch(function(err) {
                    // 429 (limit) & pesan server lain ditampilkan apa adanya; selain itu fallback mock
                    if (err && err.userMessage) renderReply(err.userMessage, false);
                    else renderReply(getAgentMockResponse(queryText, chatTurnCount), true);
                });
        } else {
            setTimeout(() => {
                renderReply(getAgentMockResponse(queryText, chatTurnCount), true);
            }, 1200);
        }
    }
    
    // Convert pseudo-markdown to HTML for clean agent message rendering
    function formatMessageText(raw) {
        // Escape HTML dulu — jawaban LLM nyata bisa mengandung tag berbahaya
        raw = String(raw).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
        var lines = raw.split('\n');
        var html = '';
        var inList = false;
        lines.forEach(function(line) {
            var t = line.trim();
            if (t.indexOf('• ') === 0 || (t.length > 2 && t[0] === '•' && t[1] === ' ')) {
                if (!inList) { html += '<ul style="padding-left:1.2rem;margin:6px 0;list-style:disc;">'; inList = true; }
                html += '<li>' + inlineFormat(t.substring(2)) + '</li>';
            } else {
                if (inList) { html += '</ul>'; inList = false; }
                if (t === '') { html += '<br>'; }
                else { html += '<span>' + inlineFormat(t) + '</span><br>'; }
            }
        });
        if (inList) html += '</ul>';
        return html;
        function inlineFormat(text) {
            return text
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.08);padding:1px 5px;border-radius:3px;font-size:0.82em;font-family:monospace;">$1</code>');
        }
    }

    // Stream agent response word-by-word like real AI output
    function typewriterEffect(bubbleEl, rawText, onDone) {
        var words = rawText.split(' ');
        var i = 0;
        bubbleEl.innerHTML = '';
        function next() {
            if (i < words.length) {
                bubbleEl.innerHTML = formatMessageText(words.slice(0, i + 1).join(' '));
                i++;
                chatViewport.scrollTop = chatViewport.scrollHeight;
                setTimeout(next, 20);
            } else {
                bubbleEl.innerHTML = formatMessageText(rawText);
                chatViewport.scrollTop = chatViewport.scrollHeight;
                if (onDone) onDone();
            }
        }
        next();
    }

    // Animated "thinking" indicator (three pulsing dots)
    function appendTypingIndicator() {
        var msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg agent typing';
        msgDiv.innerHTML =
            '<div class="msg-avatar"><img src="assets/favicon-reddie.webp" alt="Reddie Avatar"></div>' +
            '<div class="msg-bubble"><span class="thinking-dots"><span></span><span></span><span></span></span></div>';
        chatConversation.appendChild(msgDiv);
        scrollToBottom();
        return msgDiv;
    }

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}`;
        
        if (sender.includes('agent')) {
            msgDiv.innerHTML =
                '<div class="msg-avatar"><img src="assets/favicon-reddie.webp" alt="Reddie Avatar"></div>' +
                '<div class="msg-bubble">' + formatMessageText(text) + '</div>';
        } else {
            // Konten user TIDAK boleh lewat innerHTML (XSS) — pakai textContent
            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble';
            bubble.textContent = text;
            msgDiv.appendChild(bubble);
        }
        
        chatConversation.appendChild(msgDiv);
        return msgDiv;
    }
    
    function scrollToBottom() {
        chatViewport.scrollTop = chatViewport.scrollHeight;
    }

    // Chat helpers are defined in this scope but also needed by features that are
    // initialised outside it (chat toolbar attach dialog, login modal system messages),
    // so expose them once the dashboard has successfully bound its elements.
    window.showCustomPrompt = showCustomPrompt;
    window.appendMessage = appendMessage;
    window.scrollToBottom = scrollToBottom;
    
    // Bind all interactive elements inside the middle stats column (Overview/All tabs, edit pencil, collaborator plus, and submit actions)
    function bindInteractiveStatsFeatures() {
        // 1. Stats tabs toggle
        const statsTabs = document.querySelectorAll('.stats-tabs .stats-tab');
        statsTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                statsTabs.forEach(el => el.classList.remove('active'));
                tab.classList.add('active');
            });
        });
        
        // 2. Edit icon trigger
        const editIcon = document.querySelector('.billing-header .edit-icon');
        const headerTitle = document.querySelector('.billing-header h3');
        if (editIcon && headerTitle) {
            editIcon.addEventListener('click', () => {
                headerTitle.contentEditable = 'true';
                headerTitle.style.outline = '2px solid rgba(255,51,51,0.4)';
                headerTitle.style.borderRadius = '4px';
                headerTitle.style.padding = '0 4px';
                headerTitle.focus();
                var range = document.createRange();
                range.selectNodeContents(headerTitle);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                headerTitle.onblur = function() {
                    headerTitle.contentEditable = 'false';
                    headerTitle.style.outline = '';
                    headerTitle.style.padding = '';
                };
                headerTitle.onkeydown = function(e) {
                    if (e.key === 'Enter') { e.preventDefault(); headerTitle.blur(); }
                };
            });
        }
        
        // 3. Collaborators add avatar trigger
        const avatarPlus = document.querySelector('.avatar-plus');
        const avatarsRow = document.querySelector('.avatars-row');
        if (avatarPlus && avatarsRow) {
            var collabPool = [
                { initials: 'ME', bg: '#bfdbfe', fg: '#1e3a5f' },
                { initials: 'AR', bg: '#d1fae5', fg: '#14532d' },
                { initials: 'JK', bg: '#fde68a', fg: '#78350f' },
                { initials: 'SL', bg: '#fce7f3', fg: '#831843' },
                { initials: 'TN', bg: '#e9d5ff', fg: '#4c1d95' }
            ];
            var collabIdx = 0;
            avatarPlus.addEventListener('click', function() {
                var collab = collabPool[collabIdx % collabPool.length];
                collabIdx++;
                var newAvatar = document.createElement('div');
                newAvatar.className = 'avatar-circle';
                newAvatar.style.background = collab.bg;
                newAvatar.style.color = collab.fg;
                newAvatar.textContent = collab.initials;
                avatarsRow.insertBefore(newAvatar, avatarPlus);
                if (chatWelcomeState.style.display !== 'none') {
                    chatWelcomeState.style.display = 'none';
                    chatConversation.style.display = 'flex';
                }
                appendMessage('System Alert: Collaborator ' + collab.initials + ' has been added to the channel workspace.', 'agent');
                scrollToBottom();
            });
        }
        
        // 4. Action buttons bindings (using click delegation on .db-stats-col to support dynamic changes)
        const statsColContainer = document.querySelector('.db-stats-col');
        if (statsColContainer) {
            statsColContainer.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.btn-escalate');
                if (!targetBtn) return;
                
                const btnText = targetBtn.textContent.trim();
                
                // Show message container if hidden
                if (chatWelcomeState.style.display !== 'none') {
                    chatWelcomeState.style.display = 'none';
                    chatConversation.style.display = 'flex';
                }
                
                // Handle specific skill button class names first
                if (targetBtn.classList.contains('btn-skill-pdf')) {
                    targetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> GENERATING PDF...`;
                    targetBtn.disabled = true;
                    appendMessage("System Socket: Initiating document compiler... Extracting active chat transcript files...", "agent");
                    scrollToBottom();
                    
                    setTimeout(() => {
                        targetBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> DOWNLOADING...`;
                        setTimeout(() => {
                            targetBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> REPORT DOWNLOADED`;
                            appendMessage("System Socket: PDF report compiled successfully.\n\n📄 **reddie_chat_transcript.pdf** (182 KB)\n[Click here to download Stark-Session-Log.pdf]", "agent");
                            scrollToBottom();
                        }, 800);
                    }, 1200);
                }
                else if (targetBtn.classList.contains('btn-skill-excel')) {
                    targetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> COMPILING EXCEL...`;
                    targetBtn.disabled = true;
                    appendMessage("System Socket: Connecting spreadsheet socket... Compiling ticket variables into rows...", "agent");
                    scrollToBottom();
                    
                    setTimeout(() => {
                        targetBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> EXPORTED TO EXCEL`;
                        appendMessage("System Socket: Spreadsheet dataset compiled successfully.\n\n📊 **stark_workspace_dataset.xlsx** (42 KB)\nActive rows: 12 ticket variables, 1 client profile, 100% SLA confidence index.", "agent");
                        scrollToBottom();
                    }, 1500);
                }
                else if (targetBtn.classList.contains('btn-skill-sync')) {
                    targetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> SYNCING SERVER...`;
                    targetBtn.disabled = true;
                    appendMessage("System Socket: Opening PostgreSQL connection socket... Pushing live state metrics...", "agent");
                    scrollToBottom();
                    
                    setTimeout(() => {
                        targetBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> SERVER SYNCED`;
                        appendMessage("System Socket: Database sync successful. 1 active session token committed to central node.", "agent");
                        scrollToBottom();
                        setTimeout(() => {
                            targetBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Sync Server Sockets`;
                            targetBtn.disabled = false;
                        }, 2000);
                    }, 1200);
                }
                // Original button logics:
                else if (btnText.includes("Escalate to team")) {
                    targetBtn.textContent = "ESCALATED";
                    targetBtn.style.background = "#6b7280";
                    targetBtn.disabled = true;
                    appendMessage("System Alert: Ticket escalated to Technical Support Tier 2. SLA response window adjusted to 1 hour.", "agent");
                } 
                else if (btnText.includes("Enable Autopilot")) {
                    targetBtn.textContent = "AUTOPILOT ACTIVE";
                    targetBtn.style.background = "#ef4444";
                    appendMessage("System Alert: Autopilot Mode enabled. Reddie AI is now intercepting customer inquiries.", "agent");
                }
                else if (btnText.includes("AUTOPILOT ACTIVE")) {
                    targetBtn.textContent = "Enable Autopilot";
                    targetBtn.style.background = "#22c55e";
                    appendMessage("System Alert: Autopilot Mode disabled. Reverted to manual agent interception.", "agent");
                }
                else if (btnText.includes("Create New Task")) {
                    showCustomPrompt("Create New Task", "Enter task name", "Follow up on ticket #1029", function(taskName) {
                        if (taskName && taskName.trim().length > 0) {
                            appendMessage('System Alert: New task created: "' + taskName + '". Scheduled for execution.', "agent");
                            const distGrid = document.querySelector('.db-stats-col .dist-grid');
                            if (distGrid) {
                                const newTaskCard = document.createElement('div');
                                newTaskCard.className = 'dist-card';
                                newTaskCard.style.gridColumn = 'span 2';
                                newTaskCard.style.background = 'rgba(0,0,0,0.03)';
                                newTaskCard.innerHTML = '<span class="dist-type">' + taskName + '</span><span class="dist-val" style="font-size: 0.8rem; font-weight: 500;">Just created<br><span style="color: #6b7280; font-weight: 700; font-size: 0.72rem;"><i class=\'fa-solid fa-clock\'></i> Queued</span></span>';
                                distGrid.appendChild(newTaskCard);
                            }
                        }
                    });
                }
                else if (btnText.includes("Export PDF Report")) {
                    targetBtn.textContent = "GENERATING...";
                    targetBtn.disabled = true;
                    setTimeout(() => {
                        targetBtn.textContent = "DOWNLOADING...";
                        setTimeout(() => {
                            targetBtn.textContent = "DOWNLOADED";
                            appendMessage("System Alert: Report generated. 'reddie_performance_report.pdf' has been successfully compiled and downloaded.", "agent");
                            scrollToBottom();
                        }, 800);
                    }, 800);
                }
                else if (btnText.includes("Sync Now")) {
                    targetBtn.textContent = "SYNCING...";
                    targetBtn.disabled = true;
                    setTimeout(() => {
                        targetBtn.textContent = "SYNCED!";
                        appendMessage("System Alert: Knowledge Base index sync complete. 12 new help document files parsed.", "agent");
                        scrollToBottom();
                        setTimeout(() => {
                            targetBtn.textContent = "Sync Now";
                            targetBtn.disabled = false;
                        }, 2000);
                    }, 1200);
                }
                else if (btnText.includes("Trigger Test Run")) {
                    targetBtn.textContent = "RUNNING...";
                    targetBtn.disabled = true;
                    setTimeout(() => {
                        targetBtn.textContent = "TEST PASSED";
                        targetBtn.style.background = "#22c55e";
                        appendMessage("System Alert: Automation workflow validation test passed. 100% success rate (0 errors in logs).", "agent");
                        scrollToBottom();
                    }, 1200);
                }
                else if (btnText.includes("Authorize & Upgrade")) {
                    targetBtn.textContent = "UPGRADING...";
                    targetBtn.disabled = true;
                    appendMessage("Authorized payment details. Initiating billing workspace upgrades...", "user");
                    isGenerating = true;
                    
                    setTimeout(() => {
                        appendMessage("Welcome to Reddie Enterprise! 🚀\n\nYour payment of $49/mo has been authorized successfully. We have provisioned your High-Performance Coding Agent, voice integrations, and unlimited database sockets.\n\nType a command like 'Query the database for active sales' or 'Build a new landing page' to start using your premium superpowers!", "agent");
                        isGenerating = false;
                        scrollToBottom();
                        
                        const statsScrollContent = document.querySelector('.stats-scroll-content');
                        if (statsScrollContent) {
                            statsScrollContent.innerHTML = `
                                <div class="billing-card" style="background: rgba(34, 197, 94, 0.04); padding: 1.2rem; border-radius: 12px;">
                                    <div class="billing-header">
                                        <h3 style="color: #22c55e;"><i class="fa-solid fa-circle-check"></i> Enterprise Active</h3>
                                    </div>
                                    <div style="padding: 1rem; text-align: center;">
                                        <div style="font-size: 2.2rem; margin-bottom: 0.5rem; color: #22c55e;"><i class="fa-solid fa-crown"></i></div>
                                        <h4 style="margin: 0 0 0.2rem 0; color: #111827;">Workspace Premium Plan</h4>
                                        <p style="font-size: 0.75rem; color: #4b5563; margin-bottom: 1rem;">Status: Active ($49/month)</p>
                                        
                                        <div class="dist-grid" style="gap: 0.4rem; text-align: left;">
                                            <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.7); padding: 0.5rem;"><span style="color: #22c55e; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Coding Agent Sockets</span></div>
                                            <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.7); padding: 0.5rem;"><span style="color: #22c55e; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Database Sockets</span></div>
                                            <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.7); padding: 0.5rem;"><span style="color: #22c55e; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Unlimited Bandwidth</span></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }, 1200);
                }
                else if (btnText.includes("Generate API Token")) {
                    const mockToken = "sk_reddie_live_" + Math.random().toString(36).substring(2, 10);
                    appendMessage(`System Alert: New Webhook token generated successfully:\n\n\`${mockToken}\`\n\nKeep this secret safe. Connection is active.`, "agent");
                }
                
                scrollToBottom();
            });
        }
    }
    
    // Dynamic Updates for Middle Stats and Welcome State
    function updateDashboardContent(tabName) {
        const statsCol = document.querySelector('.db-stats-col');
        const welcomeTitle = document.querySelector('.chat-welcome-title');
        const welcomeSubtitle = document.querySelector('.chat-welcome-subtitle');
        const chipsContainer = document.querySelector('.suggestion-chips');
        
        if (!statsCol || !welcomeTitle || !welcomeSubtitle || !chipsContainer) return;
        
        let statsHTML = '';
        let welcomeTitleText = '';
        let welcomeSubtitleText = '';
        let chipsHTML = '';
        
        switch (tabName) {
            case "Real-Time Discussion":
                // Kerangka panel Task Scheduler. Isinya diisi live.js dari
                // /api/tasks; data-taskpanel jadi penanda tempatnya.
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active" data-cms="console.task_tab">Task Focus</span>
                        <span class="stats-tab-more"><i class="fa-solid fa-ellipsis"></i></span>
                    </div>
                    <div class="stats-scroll-content">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem;">
                            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#111827;letter-spacing:-.02em;"
                                data-cms="console.task_title">Task Focus</h3>
                            <i class="fa-solid fa-calendar-days" style="font-size:1.05rem;color:#374151;"></i>
                        </div>
                        <div data-taskpanel>
                            <p style="font-size:.78rem;color:#6b7280;margin:0;">Memuat task…</p>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Task Focus Console";
                welcomeSubtitleText = "Kelola task Anda lewat percakapan, tanpa pindah aplikasi.";
                chipsHTML = `
                    <button class="chip">Ringkas task saya hari ini</button>
                    <button class="chip">Task mana yang paling mendesak?</button>
                    <button class="chip">Buatkan task dari percakapan ini</button>
                    <button class="chip">Apa yang belum selesai minggu ini?</button>
                `;
                break;

            case "Task & Scheduling":
                // Modul Schedule. Dua tab: daftar jadwal, dan meeting yang
                // dikirim ke Google Calendar. Isinya diisi live.js.
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active" data-schedtab="list" data-cms="console.sched_tab1">Schedule List</span>
                        <span class="stats-tab" data-schedtab="meeting" data-cms="console.sched_tab2">Meeting</span>
                    </div>
                    <div class="stats-scroll-content">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
                            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#111827;letter-spacing:-.02em;"
                                data-cms="console.sched_title">Schedule</h3>
                            <i class="fa-solid fa-calendar-check" style="font-size:1.05rem;color:#374151;"></i>
                        </div>
                        <div data-schedpanel>
                            <p style="font-size:.78rem;color:#6b7280;margin:0;">Memuat jadwal…</p>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Schedule Console";
                welcomeSubtitleText = "Atur jadwal dan meeting lewat percakapan, langsung ke kalender.";
                chipsHTML = `
                    <button class="chip">Jadwal saya minggu ini apa saja?</button>
                    <button class="chip">Buatkan meeting besok jam 10 pagi, judulnya Review Sprint</button>
                    <button class="chip">Jadwalkan meeting dengan tim finance Jumat jam 14.00</button>
                    <button class="chip">Meeting apa yang paling dekat?</button>
                `;
                break;

            case "Analyze":
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active">Performance</span>
                        <span class="stats-tab">Usage</span>
                    </div>
                    <div class="stats-scroll-content">
                        <div class="billing-card">
                            <div class="billing-header">
                                <h3>Analytics & Trends</h3>
                                <span class="edit-icon"><i class="fa-solid fa-chart-line"></i></span>
                            </div>
                            <div>
                                <div class="section-label">PERFORMANCE METRICS</div>
                                <div class="dist-grid">
                                    <div class="dist-card">
                                        <span class="dist-type">Resolution Rate</span>
                                        <span class="dist-val" style="color: #22c55e;">94.6%</span>
                                    </div>
                                    <div class="dist-card">
                                        <span class="dist-type">AI Accuracy</span>
                                        <span class="dist-val" style="color: #a855f7;">98.9%</span>
                                    </div>
                                    <div class="dist-card" style="grid-column: span 2;">
                                        <span class="dist-type">Monthly Savings</span>
                                        <span class="dist-val" style="color: #111827;">$2,450.00 <span style="font-size: 0.75rem; color: #22c55e; font-weight: 600;">(+12.4%)</span></span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div class="section-label">TOKEN CONSUMPTION</div>
                                <div class="progress-bars-grid" style="grid-template-columns: 1fr; padding: 0.8rem 1rem;">
                                    <div style="font-size: 0.75rem; font-weight: 700; display: flex; justify-content: space-between; margin-bottom: 5px;">
                                        <span>Token Limit (920k / 1M)</span>
                                        <span>92%</span>
                                    </div>
                                    <div class="bar-container" style="width: 100%; height: 8px;">
                                        <div class="bar bar-sentiment" style="width: 92%; height: 100%; bottom: auto; left: 0;"></div>
                                    </div>
                                </div>
                            </div>
                            <button class="btn-escalate">Export PDF Report</button>
                        </div>
                    </div>
                `;
                welcomeTitleText = "AI Analytics Hub";
                welcomeSubtitleText = "Run complex natural language queries on customer interaction data.";
                chipsHTML = `
                    <button class="chip">Plot resolution rates</button>
                    <button class="chip">Show monthly cost trends</button>
                    <button class="chip">Calculate SLA compliance</button>
                    <button class="chip">Generate CSV report</button>
                `;
                break;
                
            case "Research":
                // Panel berita trending. Isinya diisi live.js dari /api/news.
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active" data-cms="console.news_tab">Trending</span>
                        <span class="stats-tab-more"><i class="fa-solid fa-ellipsis"></i></span>
                    </div>
                    <div class="stats-scroll-content">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
                            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#111827;letter-spacing:-.02em;"
                                data-cms="console.news_title">News Trending</h3>
                            <i class="fa-solid fa-newspaper" style="font-size:1.05rem;color:#374151;"></i>
                        </div>
                        <div data-newspanel>
                            <p style="font-size:.78rem;color:#6b7280;margin:0;">Memuat berita…</p>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Research Console";
                welcomeSubtitleText = "Pantau berita terbaru dan minta ringkasannya lewat percakapan.";
                chipsHTML = `
                    <button class="chip">Ringkas berita trending hari ini</button>
                    <button class="chip">Apa yang sedang ramai soal AI?</button>
                    <button class="chip">Ada peluang bisnis dari berita ini?</button>
                    <button class="chip">Buatkan draft posting dari berita teratas</button>
                `;
                break;

            case "Automation":
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active">Pipelines</span>
                        <span class="stats-tab">Logs</span>
                    </div>
                    <div class="stats-scroll-content">
                        <div class="billing-card">
                            <div class="billing-header">
                                <h3>Automation Pipelines</h3>
                                <span class="edit-icon"><i class="fa-solid fa-gears"></i></span>
                            </div>
                            <div>
                                <div class="section-label">ACTIVE FLOWS</div>
                                <div class="dist-grid">
                                    <div class="dist-card" style="grid-column: span 2;">
                                        <span class="dist-type">Refund Requests Auto-reply</span>
                                        <span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700; margin-top: 2px;"><i class="fa-solid fa-circle-play"></i> Active (Auto-Run)</span>
                                    </div>
                                    <div class="dist-card" style="grid-column: span 2;">
                                        <span class="dist-type">Long Email Summary</span>
                                        <span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700; margin-top: 2px;"><i class="fa-solid fa-circle-play"></i> Active (Draft Only)</span>
                                    </div>
                                    <div class="dist-card" style="grid-column: span 2;">
                                        <span class="dist-type">VIP Escalation Rules</span>
                                        <span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700; margin-top: 2px;"><i class="fa-solid fa-circle-play"></i> Active (Alert Team)</span>
                                    </div>
                                </div>
                            </div>
                            <button class="btn-escalate">Trigger Test Run</button>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Automation Engine";
                welcomeSubtitleText = "Create pipelines and rules to trigger instant AI agent responses.";
                chipsHTML = `
                    <button class="chip">Build refund auto-reply</button>
                    <button class="chip">Auto-tag billing tickets</button>
                    <button class="chip">Escalate VIPs to Slack</button>
                    <button class="chip">Draft customer greeting</button>
                `;
                break;
                
            case "Connectivity":
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active">Apps</span>
                        <span class="stats-tab">API Webhooks</span>
                    </div>
                    <div class="stats-scroll-content">
                        <div class="billing-card">
                            <div class="billing-header">
                                <h3>Integrations & APIs</h3>
                                <span class="edit-icon"><i class="fa-solid fa-link"></i></span>
                            </div>
                            <div>
                                <div class="section-label">CONNECTED APPS</div>
                                <div class="dist-grid">
                                    <div class="dist-card"><span class="dist-type"><i class="fa-brands fa-slack" style="color: #4a154b; margin-right: 4px;"></i> Slack</span><span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700;">Linked</span></div>
                                    <div class="dist-card"><span class="dist-type"><i class="fa-brands fa-shopify" style="color: #96bf48; margin-right: 4px;"></i> Shopify</span><span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700;">Linked</span></div>
                                    <div class="dist-card"><span class="dist-type"><i class="fa-brands fa-salesforce" style="color: #00a1e0; margin-right: 4px;"></i> Salesforce</span><span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700;">Linked</span></div>
                                    <div class="dist-card"><span class="dist-type"><i class="fa-regular fa-envelope" style="color: #ea4335; margin-right: 4px;"></i> Gmail API</span><span class="dist-val" style="font-size: 0.8rem; color: #22c55e; font-weight: 700;">Linked</span></div>
                                </div>
                            </div>
                            <div>
                                <div class="section-label">API LIMITS</div>
                                <div class="progress-bars-grid" style="grid-template-columns: 1fr; padding: 0.8rem 1rem;">
                                    <div style="font-size: 0.75rem; font-weight: 700; display: flex; justify-content: space-between; margin-bottom: 5px;">
                                        <span>Webhook Hits (12k / 100k)</span>
                                        <span>12%</span>
                                    </div>
                                    <div class="bar-container" style="width: 100%; height: 8px;">
                                        <div class="bar bar-progress" style="width: 12%; height: 100%; bottom: auto; left: 0;"></div>
                                    </div>
                                </div>
                            </div>
                            <button class="btn-escalate">Generate API Token</button>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Integration Console";
                welcomeSubtitleText = "Connect Reddie to Slack, Shopify, Gmail, and custom webhooks.";
                chipsHTML = `
                    <button class="chip">Link Slack workspace</button>
                    <button class="chip">Integrate Shopify store</button>
                    <button class="chip">Set custom Webhook</button>
                    <button class="chip">Check Salesforce sync status</button>
                `;
                break;
                
            case "Chat & Discussion":
            default:
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active">AI Skills Sockets</span>
                        <span class="stats-tab-more"><i class="fa-solid fa-ellipsis"></i></span>
                    </div>
                    <div class="stats-scroll-content">
                        <div class="billing-card" style="gap: 1rem;">
                            <div class="billing-header">
                                <h3>Active Sockets</h3>
                                <span class="edit-icon"><i class="fa-solid fa-wand-magic-sparkles" style="color: #ff3333;"></i></span>
                            </div>
                            
                            <p style="font-size: 0.8rem; color: #4b5563; margin-top: -0.8rem; margin-bottom: 0.4rem; line-height: 1.45;">
                                Select an active socket below to execute custom data transformations directly on the active discussion.
                            </p>

                            <div style="display: flex; flex-direction: column; gap: 1rem;" data-cms-skills>
                                <!-- Skill 1: Generate PDF -->
                                <div style="background: rgba(0,0,0,0.02); border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="width: 32px; height: 32px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; color: #ef4444;"><i class="fa-solid fa-file-pdf" style="font-size: 1.1rem;"></i></span>
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.85rem; color: #111827; font-weight: 700;">Document Generator</h4>
                                            <span style="font-size: 0.68rem; color: #6b7280; font-weight: 500;">Exports discussion to PDF</span>
                                        </div>
                                    </div>
                                    <p style="margin: 0; font-size: 0.75rem; color: #4b5563; line-height: 1.4;">Compile active chat session logs and metadata context into a styled PDF summary.</p>
                                    <button class="btn-escalate btn-skill-pdf" style="background: #ef4444; color: white; border: none; font-weight: 700; width: 100%; padding: 0.55rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.78rem;"><i class="fa-solid fa-file-pdf"></i> Generate PDF Report</button>
                                </div>

                                <!-- Skill 2: Generate Excel -->
                                <div style="background: rgba(0,0,0,0.02); border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 124, 65, 0.1); display: flex; align-items: center; justify-content: center; color: #107c41;"><i class="fa-solid fa-file-excel" style="font-size: 1.1rem;"></i></span>
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.85rem; color: #111827; font-weight: 700;">Spreadsheet Compiler</h4>
                                            <span style="font-size: 0.68rem; color: #6b7280; font-weight: 500;">Exports variables to Excel</span>
                                        </div>
                                    </div>
                                    <p style="margin: 0; font-size: 0.75rem; color: #4b5563; line-height: 1.4;">Parse conversation values, timelines, and ticket properties into a clean spreadsheet.</p>
                                    <button class="btn-escalate btn-skill-excel" style="background: #107c41; color: white; border: none; font-weight: 700; width: 100%; padding: 0.55rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.78rem;"><i class="fa-solid fa-file-excel"></i> Export to Excel</button>
                                </div>

                                <!-- Skill 3: Sync Server -->
                                <div style="background: rgba(0,0,0,0.02); border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="width: 32px; height: 32px; border-radius: 8px; background: rgba(2, 132, 199, 0.1); display: flex; align-items: center; justify-content: center; color: #0284c7;"><i class="fa-solid fa-database" style="font-size: 1.1rem;"></i></span>
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.85rem; color: #111827; font-weight: 700;">Database Sync</h4>
                                            <span style="font-size: 0.68rem; color: #6b7280; font-weight: 500;">Syncs to server cluster</span>
                                        </div>
                                    </div>
                                    <p style="margin: 0; font-size: 0.75rem; color: #4b5563; line-height: 1.4;">Commit active ticket parameters and resolved variables into your server sockets.</p>
                                    <button class="btn-escalate btn-skill-sync" style="background: #0284c7; color: white; border: none; font-weight: 700; width: 100%; padding: 0.55rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.78rem;"><i class="fa-solid fa-arrows-rotate"></i> Sync Server Sockets</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Welcome, Mr. Stark!";
                welcomeSubtitleText = "How can I help you today?";
                chipsHTML = `
                    <button class="chip">Suggest reply</button>
                    <button class="chip">Summarize</button>
                    <button class="chip">Extract key details</button>
                    <button class="chip">Detect sentiment</button>
                    <button class="chip">Search knowledge base</button>
                    <button class="chip">Rephrase professionally</button>
                `;
                break;
                
            case "And many more..":
                statsHTML = `
                    <div class="stats-tabs">
                        <span class="stats-tab active">Upgrade</span>
                        <span class="stats-tab-more"><i class="fa-solid fa-ellipsis"></i></span>
                    </div>
                    <div class="stats-scroll-content">
                        <div class="billing-card" style="background: rgba(245, 158, 11, 0.03); padding: 1.2rem; border-radius: 12px;">
                            <div class="billing-header">
                                <h3 style="color: #d97706; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-crown"></i> Unlock Premium</h3>
                            </div>
                            
                            <div>
                                <div class="section-label">LOCKED ENTERPRISE SUPERPOWERS</div>
                                <div class="dist-grid" style="gap: 0.5rem;">
                                    <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.6); padding: 0.6rem;">
                                        <span class="dist-type" style="font-weight: 700; color: #111827; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-code" style="color: #d97706;"></i> Autonomous Coding Agent</span>
                                        <span class="dist-val" style="font-size: 0.72rem; color: #4b5563; margin-top: 2px;">Deploy files, compile scripts, and design UI codebases.</span>
                                    </div>
                                    <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.6); padding: 0.6rem;">
                                        <span class="dist-type" style="font-weight: 700; color: #111827; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-database" style="color: #d97706;"></i> Custom SQL Connectors</span>
                                        <span class="dist-val" style="font-size: 0.72rem; color: #4b5563; margin-top: 2px;">Direct read/write access to PostgreSQL, MySQL, & MongoDB.</span>
                                    </div>
                                    <div class="dist-card" style="grid-column: span 2; background: rgba(255,255,255,0.6); padding: 0.6rem;">
                                        <span class="dist-type" style="font-weight: 700; color: #111827; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-phone" style="color: #d97706;"></i> Autonomous Voice Intercept</span>
                                        <span class="dist-val" style="font-size: 0.72rem; color: #4b5563; margin-top: 2px;">Let Reddie handle live phone calls and customer triage.</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="upgrade-form-section">
                                <div class="section-label">PAYMENT DETAILS</div>
                                <div style="background: rgba(255,255,255,0.85); border-radius: 8px; padding: 0.8rem; font-size: 0.8rem; border: 1px solid rgba(0,0,0,0.05);">
                                    <div style="font-weight: 800; color: #111827; margin-bottom: 2px;">Reddie Workspace Plan</div>
                                    <div style="color: #d97706; font-size: 1.1rem; font-weight: 800; margin-bottom: 6px;">$49 <span style="font-size: 0.75rem; color: #6b7280; font-weight: 500;">/ month per user</span></div>
                                    
                                    <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem;">
                                        <input type="text" placeholder="Cardholder Name" value="Tony Stark" style="width: 100%; padding: 0.35rem; border: 1px solid rgba(0,0,0,0.08); border-radius: 4px; font-size: 0.75rem; font-family: inherit; background: #f9fafb; color: #111827;" disabled>
                                        <input type="text" placeholder="Card Number" value="•••• •••• •••• 4242" style="width: 100%; padding: 0.35rem; border: 1px solid rgba(0,0,0,0.08); border-radius: 4px; font-size: 0.75rem; font-family: inherit; background: #f9fafb; color: #111827;" disabled>
                                    </div>
                                </div>
                            </div>
                            
                            <button class="btn-escalate btn-upgrade" style="background: linear-gradient(135deg, #f59e0b, #d97706); border: none; color: white;">Authorize & Upgrade</button>
                        </div>
                    </div>
                `;
                welcomeTitleText = "Enterprise Suite";
                welcomeSubtitleText = "Upgrade your active workspace to deploy autonomous execution nodes.";
                chipsHTML = `
                    <button class="chip">Unlock Autonomous Coding</button>
                    <button class="chip">Enable SQL Database access</button>
                    <button class="chip">Pricing details</button>
                    <button class="chip">Request Enterprise Quote</button>
                `;
                break;
        }
        
        statsCol.innerHTML = statsHTML;
        welcomeTitle.textContent = welcomeTitleText;
        welcomeSubtitle.textContent = welcomeSubtitleText;
        chipsContainer.innerHTML = chipsHTML;
        
        // Bind event listeners to newly generated chips & stats elements
        bindChipClickListeners();
        bindInteractiveStatsFeatures();

        // Markup di atas menimpa hasil hidrasi CMS. Pulihkan lagi:
        // tab bawaan memakai konten CMS sepenuhnya, tab lain punya teks
        // sendiri yang memang tidak dikelola CMS — cukup kolom tengahnya.
        if (window.REDDIE_HYDRATE) {
            window.REDDIE_HYDRATE(tabName === 'Chat & Discussion' ? document : statsCol);
        }
        // Panel Task Focus mengambil datanya sendiri setelah kerangkanya ada.
        if (tabName === 'Real-Time Discussion' && window.REDDIE_TASKS) window.REDDIE_TASKS();
        if (tabName === 'Task & Scheduling' && window.REDDIE_SCHEDULE) window.REDDIE_SCHEDULE();
        if (tabName === 'Research' && window.REDDIE_NEWS) window.REDDIE_NEWS();
    }
    
    function getAgentMockResponse(query, turnNum) {
        // Turn 3+ always shows pre-launch redirect (before keyword matching)
        if (turnNum >= 2) {
            return '**Hey \u2014 thanks for exploring Reddie!** \uD83D\uDC4B\n\nThis is a live preview of the platform. The full Reddie experience \u2014 with real AI agents, live customer data, and complete automation flows \u2014 officially launches on:\n\n\uD83D\uDDD3\uFE0F **October 30, 2026**\n\nBe among the first to go live. In the meantime, keep exploring the demo \u2014 every feature here reflects exactly what\'s coming!';
        }
        const lowerQuery = query.toLowerCase();
        
        // Chat & Discussion chips
        if (lowerQuery.includes('suggest reply')) {
            return `Based on the billing ticket history, here is a drafted response for the customer:\n\n"Hi Stark Industries Support,\n\nWe have reviewed the billing discrepancy for invoice #SB-8921. A credit adjustment of $47.00 has been successfully processed. You will see this applied in your next billing cycle.\n\nBest regards,\nCustomer Success Team"`;
        } 
        if (lowerQuery.includes('summarize')) {
            return `Here is a summary of the active ticket context:\n\n• **Topic**: Subscription & Billing Adjustment\n• **Status**: Pending Escalation\n• **Urgency**: SLA Risk is Low (30%)\n• **Sentiment**: Positive (80% sentiment index)\n• **Key Event**: Discrepancy identified on the Stark corporate account billing ledger.`;
        }
        if (lowerQuery.includes('extract key details')) {
            return `I have parsed the conversation and extracted the following key parameters:\n\n• **Client**: Stark Industries\n• **Contract**: Multi-tier Enterprise Subscription\n• **Disputed Amount**: $47.00 USD\n• **Confidence Index**: High (85%)\n• **Primary Agent**: Reddie AI\n• **Escalation Path**: Level 2 Technical Support`;
        }
        if (lowerQuery.includes('detect sentiment')) {
            return `Sentiment Diagnostics Report:\n\n• **Classification**: POSITIVE (80.4% certainty)\n• **Tone Analysis**: Professional, constructive, low urgency.\n• **SLA Exposure**: Low risk. Recommended action: Standard agent resolution path within 24 hours.`;
        }
        if (lowerQuery.includes('search knowledge base')) {
            return `Searching WIT.ID internal Knowledge Base... Found 2 relevant articles:\n\n1. **WIT-KB-402**: Refund policies for enterprise SLA tiers.\n2. **WIT-KB-119**: Manual adjustments of billing parameters on subscription dashboards.`;
        }
        if (lowerQuery.includes('rephrase professionally')) {
            return `Here is the rephrased response (Professional Tone):\n\n"We sincerely appreciate your feedback. Our support team is currently auditing the subscription billing records. We expect to resolve the issue within the current billing cycle and will notify you immediately."`;
        }
        
        // Real-Time Discussion chips
        if (lowerQuery.includes('intervene chat')) {
            return `Requesting manual agent takeover for WhatsApp live stream #3928...\n\nTakeover authorization sent to Jarvis. Stark is now connected. Auto-pilot has been paused.`;
        }
        if (lowerQuery.includes('view live transcript')) {
            return `Active Live Session Transcript [Shopify checkout assist]:\n\n• **Customer**: "Does checkout support Apple Pay?"\n• **Reddie (Autopilot)**: "Yes, checkout supports Apple Pay, credit cards, and local banking options."\n• **Customer**: "Awesome, ordering now."`;
        }
        if (lowerQuery.includes('autopilot response')) {
            return `Jarvis Autopilot Engine running. Analyzing incoming website tickets. Confidence margin is high (98.4%). Automatically drafted and dispatched 12 answers in the last 15 minutes.`;
        }
        if (lowerQuery.includes('greeting template')) {
            return `Dispatched greeting template [Template code: GREET-VIP-ID] to active customer streams:\n\n"Welcome to the Stark ecosystem! How can the Reddie automation engine assist you today?"`;
        }
        
        // Task & Scheduling chips
        if (lowerQuery.includes('weekly check-in')) {
            return `Created new scheduled routine: **Weekly Check-in Automation**.\n\n• **Trigger**: Every Friday, 5:00 PM UTC.\n• **Action**: Pull SLA compliance values from middle dashboard column and send summary report directly to Slack general channel.`;
        }
        if (lowerQuery.includes('sync database every friday')) {
            return `Database Sync job successfully queued for execution:\n\n• **Recurrence**: Weekly on Fridays at 11:59 PM.\n• **Target**: PostgreSQL production database synchronization.\n• **Safety Guard**: Dry-run checks enabled.`;
        }
        if (lowerQuery.includes('send newsletter on monday')) {
            return `Scheduled marketing campaign: **Monday Newsletter Delivery**.\n\n• **Target Audience**: 14,200 subscribed enterprise emails.\n• **Sender Profile**: marketing-bot@wit.id\n• **Schedule Time**: Next Monday, 8:00 AM.`;
        }
        if (lowerQuery.includes('add follow-up task')) {
            return `Follow-up task added to queue:\n\n• **Title**: Follow up with Stark Industries tech team regarding API key rotation.\n• **Due Date**: Within 48 hours.`;
        }
        
        // Analyze chips
        if (lowerQuery.includes('plot resolution rates')) {
            return `Drawing resolution rates trend chart... Resolution rate is steady at **94.6%** over the last 30 days (+4.2% month-over-month). No SLA breach risks detected.`;
        }
        if (lowerQuery.includes('cost trends')) {
            return `Monthly cost trends summary:\n\n• **Saved Cost (AI Autopilot)**: $2,450.00 saved by replacing manual triage.\n• **API tokens cost**: $220.00.\n• **Net Business Value**: $2,230.00 saved this month!`;
        }
        if (lowerQuery.includes('calculate sla compliance')) {
            return `SLA compliance audit completed:\n\n• **Enterprise SLA requirement**: 90%.\n• **Reddie Agent compliance score**: **92.0%**.\n• **Average response speed**: 1.2s.`;
        }
        if (lowerQuery.includes('generate csv report')) {
            return `Generated raw interaction report: \`reddie_diagnostics_aug_2026.csv\`.\n\nFile compiled containing 1,250 rows of logged metadata ready for download. Please click 'Export PDF Report' on the middle panel to view visual graph formats.`;
        }
        
        // Research chips
        if (lowerQuery.includes('search api docs')) {
            return `Searching API documentation specs... Found 3 instances of Authentication protocols:\n\n• **WIT-API-v2**: Custom header auth token required.\n• **OAuth2 flow**: Redirect URI must match local project domain.`;
        }
        if (lowerQuery.includes('summarize help center')) {
            return `Summary of help article: 'Enterprise Refund Policies'\n\n• **Standard refunds**: Eligible within 14 days of subscription upgrade.\n• **Enterprise SLAs**: Managed on custom contract terms on a case-by-case basis.`;
        }
        if (lowerQuery.includes('find billing issues')) {
            return `Searching application error logs for 'billing'...\n\n• Found **0 critical errors**.\n• Found **2 warning notifications** regarding minor Stark Industries invoice ledger mismatch (resolved automatically by Reddie Ledger Bot).`;
        }
        if (lowerQuery.includes('verify refund policy')) {
            return `Reddie Refund Policy validation:\n\n• **Rule**: Refund is allowed if ticket is submitted within 14 days of purchase and usage is under 1,000 API tokens. Account fits eligibility criteria.`;
        }
        
        // Automation chips
        if (lowerQuery.includes('build refund auto-reply')) {
            return `Building custom automation pipeline...\n\n• **Trigger**: Incoming email contains keyword 'refund'.\n• **Condition**: Account under 14 days of subscription.\n• **Action**: Automatically process refund transaction and notify user via email.`;
        }
        if (lowerQuery.includes('auto-tag billing')) {
            return `Billing auto-tagging rule created.\n\n• **Tag matching**: Matches 'invoice', 'credit card', 'stripe', or 'billing'.\n• **Action**: Add tag 'Billing Escalation' and assign ticket directly to financial team channel.`;
        }
        if (lowerQuery.includes('escalate vips')) {
            return `Created escalation flow:\n\n• **Condition**: Customer tier is 'Enterprise' (VIP).\n• **Action**: Direct post to Slack \`#vip-escalation-alert\` channel.`;
        }
        if (lowerQuery.includes('customer greeting')) {
            return `Drafted customer greeting template: "Hello, thank you for contacting Stark support! Let us know how we can assist you."`;
        }
        
        // Connectivity chips
        if (lowerQuery.includes('slack workspace')) {
            return `Link authorization token generated for Slack App Integration.\n\nWorkspace successfully connected. Reddie will now post critical alerts to your \`#support-alerts\` Slack channel.`;
        }
        if (lowerQuery.includes('shopify store')) {
            return `Connecting Shopify OAuth credentials... Secure API handshake successful. Reddie can now read customer checkouts, verify orders, and query inventory status.`;
        }
        if (lowerQuery.includes('custom webhook')) {
            return `Webhook trigger registered:\n\n• **Event**: \`ticket.created\`.\n• **Endpoint URL**: \`https://api.wit.id/v2/webhook/listener\`.\n• **Encryption**: HMAC SHA256 signature verification active.`;
        }
        if (lowerQuery.includes('salesforce sync')) {
            return `Salesforce sync test executed... Connection is healthy. Last synchronized: 2 minutes ago. All database entities are matching.`;
        }
        
        // And many more.. chips
        if (lowerQuery.includes('unlock autonomous coding')) {
            return `To unlock the Autonomous Coding Agent, please click the orange 'Authorize & Upgrade' button on the left panel. The premium tier includes complete file system read/write access and automated container builds.`;
        }
        if (lowerQuery.includes('enable sql database')) {
            return `Custom SQL Database connectors require the Enterprise tier. Upgrading your workspace will instantly unlock PostgreSQL, MySQL, and MongoDB hooks for Reddie.`;
        }
        if (lowerQuery.includes('pricing details')) {
            return `Reddie Premium is priced at $49/month per workspace. This includes unlimited API connectors, high-performance execution nodes, and prioritised context windows.`;
        }
        if (lowerQuery.includes('request enterprise quote')) {
            return `For dedicated clusters or custom service level agreements (SLAs), please contact the Wit. Enterprise sales team at sales@wit.ai or click 'Authorize & Upgrade' to proceed instantly.`;
        }
        
        // Turn-aware fallback responses for free-form queries
        if (turnNum === 1) {
            return 'Analyzing your request through Reddie\'s neural context engine...\n\nBased on your active workspace configuration:\n\n\u2022 **Active Context**: Enterprise support dashboard (Stark Industries)\n\u2022 **Open Tickets**: 3 flagged, 1 SLA risk detected\n\u2022 **Recommendation**: Use the action chips below for a deeper diagnostic\n\nI\'m standing by — ask me anything or pick a quick action to get started!';
        }
        if (turnNum === 2) {
            return 'Running second-pass analysis across your active dataset...\n\n\u2022 **Pattern detected**: Customer sentiment has shifted positive in the last 2 interactions\n\u2022 **SLA Status**: Within safe threshold — 72% of response window remaining\n\u2022 **Agent Confidence**: 91.2% — no escalation required at this stage\n\nWant me to draft a formal reply or pull the full interaction log?';
        }
        // Turn 3+ — pre-launch redirect
        return '**Hey — thanks for exploring Reddie!** \uD83D\uDC4B\n\nThis is a live preview of the platform. The full Reddie experience — with real AI agents, live customer data, and complete automation flows — officially launches on:\n\n\uD83D\uDDD3\uFE0F **October 30, 2026**\n\nBe among the first to go live. In the meantime, keep exploring the demo — every feature here reflects exactly what\'s coming!';
    }

    // ── Early-access signup card injected after redirect message ──────────────
    function appendLaunchSignupCard() {
        var chatConv = document.getElementById('chatConversation');
        if (!chatConv) return;

        var card = document.createElement('div');
        card.id = 'launchSignupCard';
        card.className = 'msg-row agent-row';
        card.style.cssText = 'animation: msgFadeIn 0.3s ease;';
        card.innerHTML =
            '<div class="launch-signup-card">' +
            '  <div class="launch-card-header">' +
            '    <span class="launch-card-icon">&#x1F680;</span>' +
            '    <div>' +
            '      <div class="launch-card-title">Get Early Access</div>' +
            '      <div class="launch-card-sub">Be first when Reddie launches October 30, 2026</div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="launch-card-body" id="launchCardBody">' +
            '    <form class="launch-email-form" id="launchEmailForm" autocomplete="off">' +
            '      <input type="email" id="launchEmailInput" class="launch-email-input" placeholder="Enter your email address" required>' +
            '      <button type="submit" class="launch-submit-btn">Notify Me <i class="fa-solid fa-arrow-right"></i></button>' +
            '    </form>' +
            '    <div class="launch-card-note">No spam. Just one email on launch day.</div>' +
            '  </div>' +
            '</div>';

        chatConv.appendChild(card);
        chatConv.scrollTop = chatConv.scrollHeight;

        var form = card.querySelector('#launchEmailForm');
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var emailVal = card.querySelector('#launchEmailInput').value.trim();
            if (!emailVal) return;
            var body = document.getElementById('launchCardBody');
            body.innerHTML =
                '<div class="launch-success">' +
                '  <i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:1.4rem;"></i>' +
                '  <div>' +
                '    <div class="launch-success-title">You&#39;re on the list! &#x1F389;</div>' +
                '    <div class="launch-success-sub">We&#39;ll notify <strong>' + emailVal + '</strong> on launch day.</div>' +
                '  </div>' +
                '</div>';
            chatConv.scrollTop = chatConv.scrollHeight;
        });
    }

}

// Contact Form submission mockup with interactive feedback
function setupContactForm() {
    const form = document.getElementById('contactForm');
    const successMessage = document.getElementById('formSuccessMessage');
    
    if (!form || !successMessage) return;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('.submit-btn');
        const submitText = submitBtn.querySelector('span');
        
        // Get input values
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const message = document.getElementById('message').value;
        
        // Visual "Sending..." Feedback state
        submitText.textContent = 'SENDING...';
        submitBtn.style.pointerEvents = 'none';
        submitBtn.style.opacity = '0.7';
        
        // Kirim lead ke server (fire-and-forget; kegagalan tidak mengganggu UX)
        if (window.REDDIE_API) {
            window.REDDIE_API.lead({ name: name, email: email, message: message, source: 'contact' });
        }
        
        // Simulate API call delay
        setTimeout(() => {
            // Log for developer inspection
            console.log('--- REDDIE CONTACT FORM SUBMISSION ---');
            console.log(`Name: ${name}`);
            console.log(`Email: ${email}`);
            console.log(`Message: ${message}`);
            console.log('-------------------------------------');
            
            // Fade out form and fade in success message
            form.style.opacity = '0';
            setTimeout(() => {
                form.style.display = 'none';
                successMessage.classList.add('active');
            }, 400);
            
        }, 1500);
    });
}

// ============================================================
//  CHAT TOOLBAR — Attach / Options / Model / Search / Voice
// ============================================================

function setupChatToolbar() {

    // ── DOM references ─────────────────────────────────────
    const footer        = document.querySelector('.chat-footer');
    const chatInputBar  = document.querySelector('.chat-input-bar');
    const chatInput     = document.getElementById('chatInput');
    const optLinks      = document.querySelectorAll('.opt-link');
    const voiceBtn      = document.querySelector('.voice-btn');

    if (!footer || !chatInputBar) return;

    // ── Inject panel HTML ───────────────────────────────────
    const panelsHTML =
        // ATTACH PANEL
        '<div class="chat-toolbar-panel attach-panel" id="attachPanel">' +
        '  <div class="toolbar-panel-header">Attach File <span class="panel-close-btn" data-panel="attachPanel">&#x2715;</span></div>' +
        '  <div class="attach-dropzone" id="attachDropzone">' +
        '    <i class="fa-solid fa-cloud-arrow-up"></i>' +
        '    <p>Drop files here or browse</p>' +
        '    <span class="attach-browse-btn">Browse</span>' +
        '  </div>' +
        '  <div class="attach-recents-label">Recent Files</div>' +
        '  <div class="attach-recent-item" data-filename="customer_complaint_v3.pdf" data-icon="fa-file-pdf"><i class="fa-solid fa-file-pdf"></i>customer_complaint_v3.pdf</div>' +
        '  <div class="attach-recent-item" data-filename="Q2_support_metrics.xlsx" data-icon="fa-file-excel"><i class="fa-solid fa-file-excel"></i>Q2_support_metrics.xlsx</div>' +
        '  <div class="attach-recent-item" data-filename="screenshot_error.png" data-icon="fa-file-image"><i class="fa-solid fa-file-image"></i>screenshot_error.png</div>' +
        '</div>' +

        // OPTIONS PANEL
        '<div class="chat-toolbar-panel options-panel" id="optionsPanel">' +
        '  <div class="toolbar-panel-header">Chat Options <span class="panel-close-btn" data-panel="optionsPanel">&#x2715;</span></div>' +
        '  <div class="options-row">' +
        '    <div><div class="options-row-label">Stream Response</div><div class="options-row-sub">Output token by token</div></div>' +
        '    <label class="opt-toggle"><input type="checkbox" checked id="optStream"><span class="opt-toggle-track"></span></label>' +
        '  </div>' +
        '  <div class="options-row">' +
        '    <div><div class="options-row-label">Auto-translate</div><div class="options-row-sub">Detect &amp; translate replies</div></div>' +
        '    <label class="opt-toggle"><input type="checkbox" id="optTranslate"><span class="opt-toggle-track"></span></label>' +
        '  </div>' +
        '  <div class="options-row">' +
        '    <div><div class="options-row-label">Memory</div><div class="options-row-sub">Retain context across sessions</div></div>' +
        '    <label class="opt-toggle"><input type="checkbox" checked id="optMemory"><span class="opt-toggle-track"></span></label>' +
        '  </div>' +
        '  <div class="options-row" style="flex-direction:column;align-items:flex-start;gap:0.4rem;">' +
        '    <div class="options-row-label">Response Style</div>' +
        '    <div class="opt-segment" id="styleSegment">' +
        '      <div class="opt-seg-btn active" data-val="balanced">Balanced</div>' +
        '      <div class="opt-seg-btn" data-val="precise">Precise</div>' +
        '      <div class="opt-seg-btn" data-val="creative">Creative</div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="options-row" style="flex-direction:column;align-items:flex-start;gap:0.4rem;">' +
        '    <div class="options-row-label">Context Window</div>' +
        '    <div class="opt-segment" id="ctxSegment">' +
        '      <div class="opt-seg-btn" data-val="short">Short</div>' +
        '      <div class="opt-seg-btn active" data-val="auto">Auto</div>' +
        '      <div class="opt-seg-btn" data-val="long">Long</div>' +
        '    </div>' +
        '  </div>' +
        '</div>' +

        // MODEL PANEL
        '<div class="chat-toolbar-panel model-panel" id="modelPanel">' +
        '  <div class="toolbar-panel-header">Select Model <span class="panel-close-btn" data-panel="modelPanel">&#x2715;</span></div>' +
        '  <div class="model-option selected" data-model="Reddie Core 1.5" data-color="#ff3333">' +
        '    <div class="model-icon" style="background:rgba(255,51,51,0.12);color:#ff3333;">&#x25C6;</div>' +
        '    <div class="model-info"><div class="model-name">Reddie Core 1.5 <span class="model-badge badge-active">Active</span></div><div class="model-desc">Balanced speed &amp; intelligence · 128k ctx</div></div>' +
        '    <i class="fa-solid fa-circle-check model-check"></i>' +
        '  </div>' +
        '  <div class="model-option" data-model="Reddie Pro 2.0" data-color="#7c3aed">' +
        '    <div class="model-icon" style="background:rgba(124,58,237,0.1);color:#7c3aed;">&#x2605;</div>' +
        '    <div class="model-info"><div class="model-name">Reddie Pro 2.0 <span class="model-badge badge-pro">PRO</span></div><div class="model-desc">Advanced reasoning · 256k ctx</div></div>' +
        '    <i class="fa-solid fa-circle-check model-check"></i>' +
        '  </div>' +
        '  <div class="model-option" data-model="Reddie Fast" data-color="#b45309">' +
        '    <div class="model-icon" style="background:rgba(234,179,8,0.1);color:#b45309;">&#x26A1;</div>' +
        '    <div class="model-info"><div class="model-name">Reddie Fast <span class="model-badge badge-fast">FAST</span></div><div class="model-desc">Ultra-low latency · 32k ctx</div></div>' +
        '    <i class="fa-solid fa-circle-check model-check"></i>' +
        '  </div>' +
        '  <div class="model-option" data-model="Reddie Vision" data-color="#1d4ed8">' +
        '    <div class="model-icon" style="background:rgba(29,78,216,0.1);color:#1d4ed8;">&#x1F441;</div>' +
        '    <div class="model-info"><div class="model-name">Reddie Vision <span class="model-badge badge-vision">VISION</span></div><div class="model-desc">Multimodal · images &amp; documents</div></div>' +
        '    <i class="fa-solid fa-circle-check model-check"></i>' +
        '  </div>' +
        '</div>';

    footer.insertAdjacentHTML('beforeend', panelsHTML);

    // ── Panel toggle helpers ─────────────────────────────────
    const allPanels = ['attachPanel', 'optionsPanel', 'modelPanel'];

    function openPanel(panelId) {
        allPanels.forEach(function(id) {
            var p = document.getElementById(id);
            if (p) p.classList.remove('panel-open');
        });
        optLinks.forEach(function(l) { l.classList.remove('panel-active'); });
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('panel-open');
    }

    function closeAll() {
        allPanels.forEach(function(id) {
            var p = document.getElementById(id);
            if (p) p.classList.remove('panel-open');
        });
        optLinks.forEach(function(l) { l.classList.remove('panel-active'); });
    }

    // ── Toolbar opt-link clicks ──────────────────────────────
    var panelMap = { 'Attach': 'attachPanel', 'Options': 'optionsPanel', 'Model': 'modelPanel' };

    optLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.stopPropagation();
            var txt = link.textContent.trim();
            var targetPanelId = null;
            Object.keys(panelMap).forEach(function(key) {
                if (txt.includes(key)) targetPanelId = panelMap[key];
            });
            if (!targetPanelId) return;
            var panel = document.getElementById(targetPanelId);
            if (panel && panel.classList.contains('panel-open')) {
                closeAll();
            } else {
                openPanel(targetPanelId);
                link.classList.add('panel-active');
            }
        });
    });

    // ── Close panels when clicking outside ──────────────────
    document.addEventListener('click', function(e) {
        var clickedPanel = e.target.closest('.chat-toolbar-panel');
        var clickedOpt   = e.target.closest('.opt-link');
        if (!clickedPanel && !clickedOpt) closeAll();
    });

    // ── Close buttons inside panels ──────────────────────────
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.panel-close-btn');
        if (btn) { closeAll(); }
    });

    // ── Segment controls ─────────────────────────────────────
    document.querySelectorAll('.opt-segment').forEach(function(seg) {
        seg.querySelectorAll('.opt-seg-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                seg.querySelectorAll('.opt-seg-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });
    });

    // ── Attach: recent file click ────────────────────────────
    var currentAttachment = null;

    function attachFile(filename, iconClass) {
        removeAttachment();
        currentAttachment = filename;
        var tag = document.createElement('span');
        tag.className = 'attached-file-tag';
        tag.id = 'attachedFileTag';
        tag.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>' + filename.substring(0, 22) + (filename.length > 22 ? '…' : '') + '<span class="attached-file-remove" title="Remove">&times;</span>';
        chatInputBar.insertBefore(tag, chatInputBar.querySelector('input'));
        tag.querySelector('.attached-file-remove').addEventListener('click', removeAttachment);
        closeAll();
    }

    function removeAttachment() {
        currentAttachment = null;
        var existing = document.getElementById('attachedFileTag');
        if (existing) existing.remove();
    }

    document.addEventListener('click', function(e) {
        var item = e.target.closest('.attach-recent-item');
        if (item) {
            attachFile(item.dataset.filename, item.dataset.icon);
        }
        var browse = e.target.closest('.attach-browse-btn, .attach-dropzone');
        if (browse) {
            // Simulate a file pick via custom prompt (owned by the dashboard scope)
            if (typeof window.showCustomPrompt !== 'function') return;
            window.showCustomPrompt('Attach File', 'Enter filename to attach', 'report_Q3_2025.pdf', function(fn) {
                if (fn && fn.trim()) {
                    var ext = fn.trim().split('.').pop().toLowerCase();
                    var icn = ext === 'pdf' ? 'fa-file-pdf' : ext === 'png' || ext === 'jpg' ? 'fa-file-image' : ext === 'xlsx' || ext === 'csv' ? 'fa-file-excel' : 'fa-file';
                    attachFile(fn.trim(), icn);
                }
            });
        }
    });

    // Store attachment ref for chat send
    var origSendSetup = window._origSendSetup;
    var origQueryText = '';
    // Patch appendMessage to auto-prefix attachment note
    var _origAppendMessage = window.appendMessage;
    // We'll hook into the send flow via a flag instead

    // ── Model selection ───────────────────────────────────────
    var modelOptBtn = document.querySelector('.opt-link');
    // Find the Model opt-link specifically
    var modelOptLink = null;
    optLinks.forEach(function(l) { if (l.textContent.includes('Model')) modelOptLink = l; });

    document.addEventListener('click', function(e) {
        var mo = e.target.closest('.model-option');
        if (!mo) return;
        document.querySelectorAll('.model-option').forEach(function(m) { m.classList.remove('selected'); });
        mo.classList.add('selected');
        var modelName = mo.dataset.model;
        if (modelOptLink) {
            modelOptLink.innerHTML = '<i class="fa-solid fa-cube animate-icon"></i> ' + modelName.split(' ').slice(0,2).join(' ');
        }
        setTimeout(closeAll, 220);
    });

    // ── Voice button ──────────────────────────────────────────
    if (voiceBtn) {
        var recording = false;
        var voiceTimer = null;
        voiceBtn.addEventListener('click', function() {
            if (recording) {
                recording = false;
                voiceBtn.classList.remove('recording');
                voiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                if (voiceTimer) clearTimeout(voiceTimer);
                // Fill input with a fake transcription
                if (chatInput && chatInput.value.trim() === '') {
                    var phrases = [
                        'Summarize this customer conversation',
                        'Draft a polite follow-up reply',
                        'Check if this ticket has an SLA breach',
                        'Escalate this to the billing team',
                        'Suggest the best response template'
                    ];
                    chatInput.value = phrases[Math.floor(Math.random() * phrases.length)];
                    chatInput.dispatchEvent(new Event('input'));
                }
            } else {
                recording = true;
                voiceBtn.classList.add('recording');
                voiceBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
                // Auto-stop after 3s
                voiceTimer = setTimeout(function() {
                    voiceBtn.click();
                }, 3000);
            }
        });
    }

}

// ============================================================
//  SEARCH BAR — live fake search with debounce
// ============================================================

function setupSearchBar() {

    var searchInput = document.querySelector('.db-search-bar input');
    var searchBar   = document.querySelector('.db-search-bar');
    if (!searchInput || !searchBar) return;

    // Enable the input
    searchInput.removeAttribute('disabled');
    searchInput.style.cursor = 'text';

    // Inject dropdown
    var dropdown = document.createElement('div');
    dropdown.className = 'search-results-dropdown';
    dropdown.id = 'searchDropdown';
    searchBar.appendChild(dropdown);

    var FAKE_DATA = {
        conversations: [
            { text: 'Ticket #1047 – Payment gateway timeout', sub: '2 hrs ago' },
            { text: 'Ticket #1031 – Subscription renewal issue', sub: 'Yesterday' },
            { text: 'Ticket #1019 – API rate limit exceeded', sub: '3 days ago' },
            { text: 'Ticket #1008 – Account merge request', sub: 'Last week' },
        ],
        customers: [
            { text: 'Andi Nugroho · Enterprise Plan', sub: 'Active' },
            { text: 'Sarah Kim · Growth Plan', sub: 'Active' },
            { text: 'Budi Santoso · Starter Plan', sub: 'Churned' },
            { text: 'PT. Maju Bersama · Enterprise', sub: 'Renewing' },
        ],
        tasks: [
            { text: 'Follow up billing – Andi Nugroho', sub: 'Due today' },
            { text: 'Send Q3 invoice to PT. Maju', sub: 'Queued' },
            { text: 'Review refund policy update', sub: 'In progress' },
        ]
    };

    var ICONS = { conversations: 'fa-message', customers: 'fa-user', tasks: 'fa-list-check' };
    var LABELS = { conversations: 'Conversations', customers: 'Customers', tasks: 'Tasks' };

    function highlight(str, q) {
        if (!q) return str;
        var idx = str.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return str;
        return str.substring(0, idx) + '<em>' + str.substring(idx, idx + q.length) + '</em>' + str.substring(idx + q.length);
    }

    function renderDropdown(query) {
        var q = query.trim().toLowerCase();
        var html = '';
        var hasAny = false;

        var categories = Object.keys(FAKE_DATA);
        for (var ci = 0; ci < categories.length; ci++) {
            var cat = categories[ci];
            var items = FAKE_DATA[cat].filter(function(item) {
                return !q || item.text.toLowerCase().includes(q);
            });
            if (items.length === 0) continue;
            hasAny = true;
            html += '<div class="search-result-group-label">' + LABELS[cat] + '</div>';
            for (var ii = 0; ii < items.length; ii++) {
                var item = items[ii];
                html += '<div class="search-result-item" data-cat="' + cat + '" data-text="' + item.text + '">' +
                        '<i class="fa-solid ' + ICONS[cat] + '"></i>' +
                        highlight(item.text, query.trim()) +
                        '<span class="result-sub">' + item.sub + '</span>' +
                        '</div>';
            }
            if (ci < categories.length - 1) html += '<div class="search-divider"></div>';
        }

        if (!hasAny) {
            html = '<div class="search-empty"><i class="fa-solid fa-magnifying-glass" style="margin-right:0.4rem;"></i>No results for "' + query.trim() + '"</div>';
        }

        dropdown.innerHTML = html;
        dropdown.classList.add('open');
    }

    function showRecents() {
        var html = '<div class="search-result-group-label">Recent Searches</div>';
        var recents = ['Ticket #1031', 'Andi Nugroho', 'SLA breach'];
        var icons   = ['fa-clock', 'fa-clock', 'fa-clock'];
        for (var i = 0; i < recents.length; i++) {
            html += '<div class="search-result-item"><i class="fa-solid ' + icons[i] + '"></i>' + recents[i] + '</div>';
        }
        dropdown.innerHTML = html;
        dropdown.classList.add('open');
    }

    var debounceTimer = null;
    searchInput.addEventListener('focus', function() {
        if (!searchInput.value.trim()) showRecents();
        else renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
            var val = searchInput.value;
            if (!val.trim()) { showRecents(); return; }
            renderDropdown(val);
        }, 220);
    });

    // Click result
    document.addEventListener('click', function(e) {
        var item = e.target.closest('#searchDropdown .search-result-item');
        if (item) {
            searchInput.value = item.dataset.text || item.textContent.trim().split('\n')[0];
            dropdown.classList.remove('open');
            searchInput.blur();
            // Show a quick toast
            showSearchToast(item.dataset.text || searchInput.value);
            return;
        }
        // Close if clicked outside
        if (!e.target.closest('.db-search-bar')) {
            dropdown.classList.remove('open');
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { dropdown.classList.remove('open'); searchInput.blur(); }
        if (e.key === 'Enter' && searchInput.value.trim()) {
            dropdown.classList.remove('open');
            showSearchToast(searchInput.value.trim());
        }
    });

    function showSearchToast(text) {
        var existing = document.getElementById('searchToast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.id = 'searchToast';
        toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(17,24,39,0.92);color:#fff;font-size:0.78rem;font-weight:700;padding:0.55rem 1.1rem;border-radius:20px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:none;animation:panelSlideUp 0.18s ease;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;';
        toast.innerHTML = '<i class="fa-solid fa-magnifying-glass" style="margin-right:0.4rem;"></i>Searching: ' + text.substring(0, 40) + (text.length > 40 ? '…' : '');
        document.body.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(function() { toast.remove(); }, 300);
        }, 2000);
    }
}

// About Carousel Setup
function setupAboutCarousel() {
    const prevBtn = document.getElementById('aboutPrevBtn');
    const nextBtn = document.getElementById('aboutNextBtn');
    const mascotImg = document.getElementById('aboutMascotImg');
    const titleRight = document.getElementById('aboutTitleRight');
    const descText = document.getElementById('aboutDescText');
    
    if (!prevBtn || !nextBtn || !mascotImg || !titleRight || !descText) return;
    
    const aboutAgents = [
        {
            name: "REDDIE",
            image: "assets/Character-Reddie.webp",
            desc: "Reddie is the signature AI Agent developed by <strong>WIT.ID</strong>. Engineered to be the ultimate digital companion, Reddie operates as an autonomous force to streamline IT operations, automate complex workflows, and deliver comprehensive 360° technology solutions."
        },
        {
            name: "KOPPIE",
            image: "assets/Shadow-Koppie.webp",
            desc: "Koppie is a specialized database and pipeline controller agent in development. Designed to streamline server synchronizations, coordinate file-system operations, and manage automated workflow hooks."
        },
        {
            name: "PINKIE",
            image: "assets/Shadow-Pinkie.webp",
            desc: "Pinkie is a creative copywriter and UI template design assistant. Structured to generate content, export organized data matrices, and design responsive mockup templates dynamically."
        },
        {
            name: "PRIMMIE",
            image: "assets/Shadow-Primmie.webp",
            desc: "Primmie is the premium developer coding agent. Engineered to run diagnostic test blocks, execute compiler pipelines, and refactor stylesheet syntax rules with extreme speed."
        }
    ];
    
    let currentAgentIndex = 0;
    
    function updateAgent(index) {
        const list = (window.__aboutAgentsOverride && window.__aboutAgentsOverride.length)
            ? window.__aboutAgentsOverride : aboutAgents;
        const agent = list[index % list.length];
        
        // Quick fade transition
        mascotImg.style.opacity = '0';
        titleRight.style.opacity = '0';
        descText.style.opacity = '0';
        
        setTimeout(() => {
            mascotImg.src = agent.image;
            titleRight.textContent = agent.name;
            descText.innerHTML = agent.desc;
            
            mascotImg.style.opacity = '1';
            titleRight.style.opacity = '1';
            descText.style.opacity = '1';
        }, 250);
    }
    
    prevBtn.addEventListener('click', () => {
        const n = (window.__aboutAgentsOverride && window.__aboutAgentsOverride.length) || aboutAgents.length;
        currentAgentIndex = (currentAgentIndex - 1 + n) % n;
        updateAgent(currentAgentIndex);
    });
    
    nextBtn.addEventListener('click', () => {
        const n = (window.__aboutAgentsOverride && window.__aboutAgentsOverride.length) || aboutAgents.length;
        currentAgentIndex = (currentAgentIndex + 1) % n;
        updateAgent(currentAgentIndex);
    });
}

// Login Modal Setup
function setupLoginModal() {
    const profileBox = document.getElementById('sidebarProfileBox');
    const loginModal = document.getElementById('loginModalOverlay');
    const closeModal = document.getElementById('loginModalClose');
    const loginForm = document.getElementById('loginModalForm');
    const profileName = document.getElementById('sidebarProfileName');
    const profileStatus = document.getElementById('sidebarProfileStatus');
    const profileAvatar = document.getElementById('sidebarProfileAvatar');
    const submitBtn = document.getElementById('loginSubmitBtn');
    
    if (!profileBox || !loginModal || !closeModal || !loginForm) return;
    
    // Open modal
    profileBox.addEventListener('click', () => {
        loginModal.classList.add('show');
    });
    
    // Close modal
    closeModal.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent re-triggering the parent click
        loginModal.classList.remove('show');
    });
    
    // Close modal on overlay click
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.classList.remove('show');
        }
    });
    
    // Submit form (Simulated Login)
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const username = email.split('@')[0];
        const capitalizedUser = username.charAt(0).toUpperCase() + username.slice(1);
        
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> LOGGING IN...`;
        submitBtn.disabled = true;
        
        // Simpan email sebagai lead (fire-and-forget)
        if (window.REDDIE_API) {
            window.REDDIE_API.lead({ email: email, source: 'login' });
        }
        
        setTimeout(() => {
            // Close modal
            loginModal.classList.remove('show');
            
            // Restore button
            submitBtn.innerHTML = `Log In`;
            submitBtn.disabled = false;
            
            // Update profile box to signed-in state
            if (profileName && profileStatus && profileAvatar) {
                profileName.textContent = capitalizedUser;
                profileStatus.textContent = "Workspace: Active";
                profileAvatar.innerHTML = `<img src="assets/favicon-reddie.webp" alt="User Avatar">`;
            }
            
            // Post a system alert in the chat that the workspace has synced
            const chatWelcomeState = document.querySelector('.chat-welcome-state');
            const chatConversation = document.querySelector('.chat-conversation');
            
            if (chatWelcomeState && chatConversation) {
                if (chatWelcomeState.style.display !== 'none') {
                    chatWelcomeState.style.display = 'none';
                    chatConversation.style.display = 'flex';
                }
            }
            
            if (typeof window.appendMessage === 'function') {
                window.appendMessage(`System Alert: Account '${email}' successfully authenticated. Committing sync state...`, 'agent');
                window.appendMessage(`Welcome back, ${capitalizedUser}! Workspace settings and agent models have been successfully synchronized.`, 'agent');
                window.scrollToBottom();
            }
            
            // Reset form
            loginForm.reset();
        }, 1200);
    });
}

// ── Initialize new features ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    setupChatToolbar();
    setupSearchBar();
    setupAboutCarousel();
    setupLoginModal();
});
