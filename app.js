document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const priorityInput = document.getElementById('task-priority');
    const taskList = document.getElementById('task-list');
    const btnTheme = document.getElementById('btn-theme');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    // Progress UI
    const progressFill = document.getElementById('progress-fill');
    const taskCountText = document.getElementById('task-count-text');
    
    // Dynamic Island
    const dynamicIsland = document.getElementById('dynamic-island');
    const islandIndicator = document.getElementById('supabase-indicator');
    const islandDetailText = document.getElementById('island-detail-text');
    let islandTimeout;

    function triggerIsland(msg, isError = false) {
        if(islandDetailText) islandDetailText.textContent = msg;
        if(islandIndicator) {
            islandIndicator.className = 'status-dot';
            islandIndicator.classList.add(isError ? 'error' : 'synced');
        }
        dynamicIsland.classList.add('expanded');
        
        clearTimeout(islandTimeout);
        islandTimeout = setTimeout(() => {
            dynamicIsland.classList.remove('expanded');
        }, 2500);
    }
    
    let tasks = [];
    let supabase = null;
    let hasBootstrapped = false;
    let currentFilter = 'all';

    // --- Audio Micro-Interactions ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playBubbleSound() {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    }
    function playDropSound() {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }

    // --- Theme Setup ---
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    btnTheme.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents island click
        playDropSound();
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        triggerIsland(newTheme === 'dark' ? 'Dark Mode Enabled' : 'Light Mode Enabled');
    });

    dynamicIsland.addEventListener('click', () => {
        dynamicIsland.classList.toggle('expanded');
    });

    // --- Parallax ---
    const bgCanvas = document.getElementById('bg-canvas');
    document.addEventListener('mousemove', (e) => {
        // Parallax depth
        const x = (e.clientX / window.innerWidth - 0.5) * 40;
        const y = (e.clientY / window.innerHeight - 0.5) * 40;
        if(bgCanvas) bgCanvas.style.transform = `translate(${-x}px, ${-y}px)`;
    });

    // --- Video & Chat UI ---
    const btnVideo = document.getElementById('btn-video');
    const btnChat = document.getElementById('btn-chat');
    const chatDrawer = document.getElementById('chat-drawer');
    const btnCloseChat = document.getElementById('btn-close-chat');

    const videoModal = document.getElementById('video-modal');
    const btnCloseVideo = document.getElementById('btn-close-video');
    const videoContent = document.getElementById('video-content');
    let jitsiApi = null;

    btnChat.addEventListener('click', () => { chatDrawer.classList.add('open'); });
    btnCloseChat.addEventListener('click', () => { chatDrawer.classList.remove('open'); });
    
    btnVideo.addEventListener('click', () => { 
        videoModal.classList.add('open');
        if (!jitsiApi && window.JitsiMeetExternalAPI) {
            const domain = 'meet.jit.si';
            const options = {
                roomName: 'HydroTrack_Team_Room_2026',
                width: '100%',
                height: '100%',
                parentNode: videoContent,
                configOverwrite: { startWithAudioMuted: true, startWithVideoMuted: true },
                interfaceConfigOverwrite: { filmStripOnly: false }
            };
            jitsiApi = new window.JitsiMeetExternalAPI(domain, options);
        }
    });

    btnCloseVideo.addEventListener('click', () => { 
        videoModal.classList.remove('open'); 
    });

    // Video Dragging
    const videoDragHandle = document.getElementById('video-drag-handle');
    let isDraggingVideo = false, vidStartX, vidStartY, vidInitialX, vidInitialY;
    videoDragHandle.addEventListener('mousedown', (e) => {
        isDraggingVideo = true; vidStartX = e.clientX; vidStartY = e.clientY;
        const rect = videoModal.getBoundingClientRect();
        vidInitialX = rect.left; vidInitialY = rect.top;
        videoModal.style.transform = `none`; 
        videoModal.style.left = vidInitialX + 'px';
        videoModal.style.top = vidInitialY + 'px';
    });
    document.addEventListener('mousemove', (e) => {
        if(!isDraggingVideo) return;
        videoModal.style.left = (vidInitialX + e.clientX - vidStartX) + 'px';
        videoModal.style.top = (vidInitialY + e.clientY - vidStartY) + 'px';
    });
    document.addEventListener('mouseup', () => { isDraggingVideo = false; });

    // --- Initialize Supabase ---
    const HARDCODED_URL = 'https://yntavopeqcnzgwxzhpvb.supabase.co';
    const HARDCODED_KEY = 'sb_publishable_uiY3RO-8L_D4lx2SuMmlFg_O37HLsQs';

    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(HARDCODED_URL, HARDCODED_KEY);
            initMultiplayerCursors();
        } else {
            triggerIsland('Supabase Error', true);
        }
    } catch (e) {
        triggerIsland('Supabase Error', true);
    }

    // --- Multiplayer Cursors ---
    function initMultiplayerCursors() {
        const cursorContainer = document.getElementById('cursors-container');
        const myId = 'user_' + Math.random().toString(36).substr(2, 9);
        const myColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        
        const room = supabase.channel('team_room'); // Upgraded room name
        
        // Listen for chat
        const chatMessages = document.getElementById('chat-messages');
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');

        room.on('broadcast', { event: 'chat-msg' }, payload => {
            const { text, color } = payload.payload;
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg';
            msgEl.textContent = text;
            msgEl.style.borderColor = color;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            playBubbleSound();
            if(!chatDrawer.classList.contains('open')) {
                triggerIsland('New Team Message');
            }
        });

        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if(!text) return;
            
            // Render my message
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-msg mine';
            msgEl.textContent = text;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            chatInput.value = '';

            room.send({
                type: 'broadcast',
                event: 'chat-msg',
                payload: { text, color: myColor }
            });
        });

        // Listen for cursors
        room.on('broadcast', { event: 'cursor-move' }, payload => {
            const { id, x, y, color } = payload.payload;
            if (id === myId) return;
            
            let cursorEl = document.getElementById('cursor-' + id);
            if (!cursorEl) {
                cursorEl = document.createElement('div');
                cursorEl.id = 'cursor-' + id;
                cursorEl.className = 'remote-cursor';
                cursorEl.innerHTML = `<svg viewBox="0 0 16 16" fill="${color}"><path d="M1 1l5.5 13.5L9 9l5.5-2.5L1 1z" stroke="white" stroke-width="1.5"/></svg>`;
                cursorContainer.appendChild(cursorEl);
                triggerIsland('New User Joined');
            }
            cursorEl.style.transform = `translate(${x}px, ${y}px)`;
        }).subscribe();

        let lastSend = 0;
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastSend > 50) { 
                lastSend = now;
                room.send({
                    type: 'broadcast',
                    event: 'cursor-move',
                    payload: { id: myId, x: e.clientX, y: e.clientY, color: myColor }
                }).catch(()=>{});
            }
        });
    }

    // --- Data Core ---
    function getLocalTasks() {
        try {
            const local = JSON.parse(localStorage.getItem('simpleTrackerTasks')) || [];
            return local.map(normalizeTask).filter(Boolean);
        } catch(e) { return []; }
    }

    function mergeTasks(preferredTasks, incomingTasks) {
        const merged = new Map();
        incomingTasks.filter(Boolean).forEach((task) => merged.set(task.id, task));
        preferredTasks.filter(Boolean).forEach((task) => merged.set(task.id, task));
        return Array.from(merged.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    }

    async function loadTasks() {
        if (!hasBootstrapped) {
            tasks = getLocalTasks();
            triggerRender();
            hasBootstrapped = true;
        }

        try {
            if (supabase) {
                const { data, error } = await supabase.from('tasks').select('*');
                if (!error && data) {
                    triggerIsland('Synced to Cloud');
                    const remoteTasks = data.map(normalizeTask).filter(Boolean);
                    tasks = mergeTasks(tasks, remoteTasks);
                    triggerRender();
                    await saveTasksLocally();
                    return;
                } else if (error) { triggerIsland('Sync Failed', true); }
            }
        } catch(e) { triggerIsland('Sync Failed', true); }

        tasks = getLocalTasks();
        triggerRender();
    }

    function normalizeTask(t) {
        if(!t) return null;
        return {
            id: t.id || 'task_' + Date.now() + Math.random().toString(36).substr(2, 5),
            text: t.text || 'Untitled',
            priority: t.priority || 'medium',
            notes: t.notes || '',
            links: Array.isArray(t.links) ? t.links : [],
            reviews: t.reviews || '',
            images: Array.isArray(t.images) ? t.images : [],
            completed: !!t.completed,
            created_at: t.created_at || new Date().toISOString()
        };
    }

    // --- Kanban Tabs ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playDropSound();
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            triggerRender();
        });
    });

    // --- Progress UI ---
    function updateProgress() {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        
        progressFill.style.width = `${pct}%`;
        taskCountText.textContent = `${pct}% (${completed}/${total} Hydrated)`;
        
        if (pct === 100 && total > 0 && window.confetti) {
            window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0088ff', '#00d0ff', '#ffffff'] });
        }
    }

    // --- Rendering with FLIP View Transitions ---
    let draggedIndex = null;

    function triggerRender() {
        // Native View Transitions API smoothly morphs the DOM changes!
        if (document.startViewTransition) {
            document.startViewTransition(() => renderTasksInner());
        } else {
            renderTasksInner();
        }
    }

    function renderTasksInner() {
        taskList.innerHTML = '';
        
        let filteredTasks = tasks;
        if (currentFilter === 'todo') filteredTasks = tasks.filter(t => !t.completed);
        if (currentFilter === 'completed') filteredTasks = tasks.filter(t => t.completed);
        
        if (filteredTasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5; margin-bottom: 8px;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
                    <div>Queue is clear for this view.<br>Hydrate to dominate!</div>
                </div>
            `;
        } else {
            filteredTasks.forEach((task) => {
                const globalIndex = tasks.findIndex(t => t.id === task.id);
                const li = document.createElement('li');
                li.className = `task-item ${task.completed ? 'completed' : ''} ${task.priority === 'high' && !task.completed ? 'priority-high-glow' : ''}`;
                li.draggable = true;
                li.style.viewTransitionName = `task-${task.id}`; // Magic key for FLIP animations
                
                // Drag and Drop Events
                li.addEventListener('dragstart', (e) => {
                    draggedIndex = globalIndex;
                    li.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                li.addEventListener('dragend', () => {
                    li.classList.remove('dragging');
                    draggedIndex = null;
                });
                li.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
                li.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== globalIndex) {
                        const draggedTask = tasks.splice(draggedIndex, 1)[0];
                        tasks.splice(globalIndex, 0, draggedTask);
                        triggerRender();
                        await saveTasksLocally();
                    }
                });
                
                // 3D Tilt Effect
                li.addEventListener('mousemove', (e) => {
                    if(task.completed) return;
                    const rect = li.getBoundingClientRect();
                    const x = e.clientX - rect.left; 
                    const y = e.clientY - rect.top;
                    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -5;
                    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 5;
                    li.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                    li.style.zIndex = "100";
                });
                li.addEventListener('mouseleave', () => {
                    li.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
                    li.style.zIndex = "1";
                });
                
                let dateDisplay = '';
                if (task.created_at) {
                    const dateObj = new Date(task.created_at);
                    if (!isNaN(dateObj.getTime())) {
                        dateDisplay = `<span class="task-date">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>`;
                    }
                }

                let linksHtml = '';
                if(task.links) {
                    linksHtml = task.links.map((link, linkIndex) => {
                        const safeLink = link || '';
                        const display = safeLink.replace(/^https?:\/\//i, '');
                        return `
                            <div class="link-item-pill">
                                <a href="${safeLink}" target="_blank" title="${safeLink}">${display}</a>
                                <button type="button" class="btn-remove-link" onclick="window.removeLink(${globalIndex}, ${linkIndex})">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        `;
                    }).join('');
                }

                let imagesHtml = '';
                if(task.images) {
                    imagesHtml = task.images.map((img, imgIndex) => {
                        const isDoc = img.startsWith('data:application/');
                        return `
                            <div class="image-wrapper" title="${isDoc ? 'Document Attached' : 'Image'}">
                                ${isDoc ? `<div class="file-icon" onclick="window.open('${img || ''}', '_blank')">📄</div>` : `<img src="${img || ''}" onclick="window.open('${img || ''}', '_blank')">`}
                                <button type="button" class="btn-remove-img" onclick="window.removeImage(${globalIndex}, ${imgIndex})">✕</button>
                            </div>
                        `;
                    }).join('');
                }

                li.innerHTML = `
                    <div class="task-main">
                        <label class="task-content">
                            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="window.toggleTask(${globalIndex})">
                            <div class="task-info">
                                <div class="task-title-row">
                                    <span class="task-text">${task.text}</span>
                                    <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                                    ${dateDisplay}
                                </div>
                            </div>
                        </label>
                        <button class="btn-delete" onclick="window.deleteTask(${globalIndex})" title="Delete task">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="task-details">
                        <div class="detail-group">
                            <label>Rich Text Notes</label>
                            <div class="toolbar">
                                <button type="button" onclick="document.execCommand('bold', false, null)"><b>B</b></button>
                                <button type="button" onclick="document.execCommand('italic', false, null)"><i>I</i></button>
                                <button type="button" onclick="document.execCommand('underline', false, null)"><u>U</u></button>
                                <button type="button" onclick="document.execCommand('insertUnorderedList', false, null)">• List</button>
                            </div>
                            <div class="glass-input detail-input" contenteditable="true" placeholder="Add rich formatting ideas..." onblur="window.updateField(${globalIndex}, 'notes', this.innerHTML)">${task.notes || ''}</div>
                        </div>
                        <div class="detail-group">
                            <label>Links</label>
                            <div class="links-container">
                                ${linksHtml}
                                <input type="text" class="glass-input detail-input" placeholder="Paste a link and press Enter..." onkeydown="window.handleAddLink(event, ${globalIndex}, this)">
                            </div>
                        </div>
                        <div class="detail-group">
                            <label>Files & Concepts</label>
                            <div class="images-gallery" id="gallery-${globalIndex}">
                                ${imagesHtml}
                            </div>
                            <label class="btn-upload-image">
                                <span>+ Add File/Image</span>
                                <input type="file" accept="image/*,application/pdf" style="display: none" onchange="window.handleAddImage(event, ${globalIndex})">
                            </label>
                        </div>
                    </div>
                `;
                taskList.appendChild(li);
            });
        }
        updateProgress();
    }

    // --- Event Listeners ---
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        const priority = priorityInput.value;
        
        if (text) {
            playDropSound();
            const newTask = normalizeTask({ text, priority });
            tasks.unshift(newTask);
            
            taskInput.value = '';
            taskInput.focus();
            
            triggerRender();
            triggerIsland('Move Added');
            await saveTasksLocally();
            await syncSingleTask(newTask);
        }
    });

    window.toggleTask = async (index) => {
        tasks[index].completed = !tasks[index].completed;
        if(tasks[index].completed) playBubbleSound();
        triggerRender();
        await saveTasksLocally();
        await syncSingleTask(tasks[index]);
    };
    
    window.updateField = async (index, field, value) => {
        if(tasks[index]) {
            tasks[index][field] = value;
            await saveTasksLocally();
            await syncSingleTask(tasks[index]);
        }
    };

    window.handleAddLink = async (event, index, inputElem) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const val = inputElem.value.trim();
            if (val && tasks[index]) {
                let url = val;
                if (!/^https?:\/\//i.test(url)) { url = 'https://' + url; }
                tasks[index].links.push(url);
                inputElem.value = '';
                triggerRender();
                await saveTasksLocally();
                await syncSingleTask(tasks[index]);
            }
        }
    };

    window.removeLink = async (taskIndex, linkIndex) => {
        if(tasks[taskIndex]) {
            tasks[taskIndex].links.splice(linkIndex, 1);
            triggerRender();
            await saveTasksLocally();
            await syncSingleTask(tasks[taskIndex]);
        }
    };

    window.deleteTask = async (index) => {
        if (!confirm('Permanently delete this move?')) return;
        
        const taskToDelete = tasks[index];
        const domIndex = Array.from(taskList.children).findIndex(li => li.querySelector(`.btn-delete[onclick*="${index}"]`));
        const item = taskList.children[domIndex];
        
        if (item) {
            item.style.transform = 'scale(0.8) rotateX(-20deg)';
            item.style.opacity = '0';
            setTimeout(async () => {
                tasks.splice(index, 1);
                triggerRender();
                triggerIsland('Move Deleted');
                await saveTasksLocally();
                if (supabase && taskToDelete && taskToDelete.id) {
                    try { await supabase.from('tasks').delete().eq('id', taskToDelete.id); } catch(e){}
                }
            }, 300);
        }
    };

    function readFileAsBase64(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if(file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX = 600;
                    let w = img.width, h = img.height;
                    if (w > h && w > MAX) { h *= MAX/w; w = MAX; }
                    else if (h > MAX) { w *= MAX/h; h = MAX; }
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    callback(canvas.toDataURL('image/jpeg', 0.6));
                }
                img.src = e.target.result;
            } else { callback(e.target.result); }
        }
        reader.readAsDataURL(file);
    }

    window.handleAddImage = (event, index) => {
        const file = event.target.files[0];
        if (!file || !tasks[index]) return;
        if (file.size > 2 * 1024 * 1024) { alert('Please select a file under 2MB.'); return; }

        event.target.parentElement.querySelector('span').textContent = 'Processing...';
        readFileAsBase64(file, async (dataUrl) => {
            tasks[index].images.push(dataUrl);
            triggerRender();
            triggerIsland('File Attached');
            await saveTasksLocally();
            await syncSingleTask(tasks[index]);
        });
    };

    window.removeImage = async (taskIndex, imgIndex) => {
        if (!confirm('Delete this file?')) return;
        if(tasks[taskIndex]) {
            tasks[taskIndex].images.splice(imgIndex, 1);
            triggerRender();
            await saveTasksLocally();
            await syncSingleTask(tasks[taskIndex]);
        }
    };

    async function saveTasksLocally() {
        try { localStorage.setItem('simpleTrackerTasks', JSON.stringify(tasks)); } catch(e){}
    }

    async function syncSingleTask(task) {
        if (supabase && task) {
            try {
                const { error } = await supabase.from('tasks').upsert(task);
                if (error) { triggerIsland('Sync Error', true); }
            } catch(e) { triggerIsland('Sync Error', true); }
        }
    }

    // Boot
    loadTasks();
});
