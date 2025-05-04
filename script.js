/* Fallback copy function */
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let successful = false;
    try {
        successful = document.execCommand("copy");
    } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
    }
    document.body.removeChild(textArea);
    return successful;
}

// Moved outside DOMContentLoaded to be globally accessible
function showCopyFeedback(message, isError = false, feedbackElement) {
    if (!feedbackElement) return;
    feedbackElement.textContent = message;
    feedbackElement.style.color = isError ? "red" : "green";
    const otherFeedbackId = feedbackElement.id === "copy-url-feedback" ? "copy-md-feedback" : "copy-url-feedback";
    const copyModal = document.getElementById("copy-modal");
    if (copyModal) {
        const otherFeedbackElement = copyModal.querySelector(`#${otherFeedbackId}`);
        if (otherFeedbackElement) otherFeedbackElement.textContent = "";
    }
    setTimeout(() => {
        if (feedbackElement) feedbackElement.textContent = "";
    }, 2000);
}

/* Enhanced copy function with copyType */
function copyText(text, feedbackElement, copyType) {
    const successMessage = `${copyType}已复制!`;
    const fallbackSuccessMessage = `${copyType}已复制 (备用方式)!`;
    const failureMessage = `${copyType}复制失败!`;
    const errorMessage = `${copyType}复制失败: `;

    if (!navigator.clipboard) {
        if (fallbackCopyTextToClipboard(text)) {
            showCopyFeedback(fallbackSuccessMessage, false, feedbackElement);
        } else {
            showCopyFeedback(failureMessage, true, feedbackElement);
        }
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(successMessage, false, feedbackElement);
    }).catch(err => {
        console.error("Async: Could not copy text: ", err);
        showCopyFeedback(errorMessage + err, true, feedbackElement);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Element References
    const packageList = document.getElementById("package-list");
    const emojiDisplay = document.getElementById("emoji-display");
    const currentPackageTitle = document.getElementById("current-package-title");
    const searchPackagesInput = document.getElementById("search-packages");
    const serverSelect = document.getElementById("server-select");
    const sidebar = document.getElementById("sidebar");
    const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
    const mainContent = document.getElementById("main-content");
    const welcomePage = document.getElementById("welcome-page");
    const sidebarMainTitle = document.getElementById("sidebar-main-title");

    // Copy Modal Elements
    const copyModal = document.getElementById("copy-modal");
    const modalEmojiName = document.getElementById("modal-emoji-name");
    const modalCloseTopBtn = copyModal.querySelector(".modal-close-top");
    const modalCloseBottomBtn = document.getElementById("modal-close-bottom");
    const modalEmojiImg = document.getElementById("modal-emoji-img");
    const urlCopyContent = copyModal.querySelector("#copy-url-content");
    const urlCopyFeedback = copyModal.querySelector("#copy-url-feedback");
    const mdCopyContent = copyModal.querySelector("#copy-md-content");
    const mdCopyFeedback = copyModal.querySelector("#copy-md-feedback");

    // Loading Progress Elements
    const loadingProgressDiv = document.getElementById("loading-progress");
    const progressBar = document.getElementById("progress-bar");
    const progressPercent = document.getElementById("progress-percent");
    const progressLoaded = document.getElementById("progress-loaded");
    const progressTotal = document.getElementById("progress-total");
    const progressSpeed = document.getElementById("progress-speed");

    // State Variables
    let emojiData = { packages: [] };
    let config = { servers: [] };
    let selectedServer = null;
    let currentEmojiUrl = "";
    let currentEmojiName = "";
    const defaultWelcomeTitle = "欢迎使用 Emoji Explorer";
    const SERVER_STORAGE_KEY = 'selectedEmojiServerId';

    // --- Function to Show Welcome Page ---
    function showWelcomePage() {
        if (welcomePage) welcomePage.style.display = 'block';
        if (emojiDisplay) emojiDisplay.style.display = 'none';
        if (currentPackageTitle) currentPackageTitle.textContent = defaultWelcomeTitle;
        const currentActive = packageList.querySelector("li.active");
        if (currentActive) {
            currentActive.classList.remove("active");
        }
    }

    // --- Data Fetching with Progress --- START
    async function fetchDataWithProgress(url, onProgress) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');
        let receivedLength = 0;
        let chunks = [];
        let startTime = Date.now();
        let lastUpdateTime = startTime;
        let lastLoadedBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
            receivedLength += value.length;

            const currentTime = Date.now();
            const timeSinceLastUpdate = (currentTime - lastUpdateTime) / 1000;

            let speed = 0;
            // Update speed calculation more frequently for better responsiveness
            if (timeSinceLastUpdate > 0.1) { // Update roughly every 100ms
                const bytesSinceLastUpdate = receivedLength - lastLoadedBytes;
                speed = bytesSinceLastUpdate / timeSinceLastUpdate / 1024; // KB/s
                lastUpdateTime = currentTime;
                lastLoadedBytes = receivedLength;
                 // Call onProgress within the speed update block to ensure speed is current
                 if (onProgress) {
                    onProgress(receivedLength, contentLength, speed);
                }
            } else if (onProgress) {
                 // Still call onProgress for percentage updates even if speed isn't recalculated yet
                 const currentSpeed = (receivedLength - lastLoadedBytes) / ((currentTime - lastUpdateTime)/1000) / 1024;
                 onProgress(receivedLength, contentLength, currentSpeed > 0 ? currentSpeed : speed); // Use last calculated speed if interval too short
            }
        }

        // Ensure final progress update is sent
        if (onProgress) {
             const finalSpeed = (receivedLength - lastLoadedBytes) / ((Date.now() - lastUpdateTime)/1000) / 1024;
             onProgress(receivedLength, contentLength, finalSpeed > 0 ? finalSpeed : 0);
        }

        let chunksAll = new Uint8Array(receivedLength);
        let position = 0;
        for (let chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;
        }

        const result = new TextDecoder("utf-8").decode(chunksAll);
        return JSON.parse(result);
    }

    async function fetchData() {
        try {
            // Fetch config normally
            const configRes = await fetch("data/config.json");
            if (!configRes.ok) throw new Error(`HTTP error! status: ${configRes.status}`);
            config = await configRes.json();

            // Show progress bar before fetching large emoji data
            if (loadingProgressDiv) loadingProgressDiv.style.display = 'block';

            // Fetch emoji data with progress
            emojiData = await fetchDataWithProgress("data/emoji_data.json", (loaded, total, speed) => {
                if (progressBar && progressPercent && progressLoaded && progressTotal && progressSpeed) {
                    const percent = total ? Math.round((loaded / total) * 100) : 0;
                    progressBar.value = percent;
                    progressPercent.textContent = percent;
                    progressLoaded.textContent = (loaded / 1024 / 1024).toFixed(2);
                    // Display total in MB, handle case where total is unknown
                    progressTotal.textContent = total ? (total / 1024 / 1024).toFixed(2) : '??';
                    progressSpeed.textContent = speed > 0 ? speed.toFixed(1) : '0.0'; // Ensure speed is non-negative
                }
            });

            // Hide progress bar after successful load
            if (loadingProgressDiv) loadingProgressDiv.style.display = 'none';

            // --- Initialize UI after data is loaded ---
            populateServerSelect();

            const savedServerId = localStorage.getItem(SERVER_STORAGE_KEY);
            let initialServerId = "origin";
            // Ensure config.servers exists and is an array before using .some and .find
            if (config.servers && Array.isArray(config.servers)) {
                if (savedServerId && config.servers.some(s => s.id === savedServerId)) {
                    initialServerId = savedServerId;
                }
                selectedServer = config.servers.find(s => s.id === initialServerId);
                if (selectedServer) {
                    serverSelect.value = selectedServer.id;
                    updateSelectedServerReferrerPolicy();
                } else {
                    // Fallback if saved ID is invalid or origin doesn't exist
                    selectedServer = config.servers.length > 0 ? config.servers[0] : null;
                    if (selectedServer) {
                        serverSelect.value = selectedServer.id;
                        updateSelectedServerReferrerPolicy();
                    }
                }
            } else {
                console.error("Config servers data is missing or invalid.");
                // Handle missing server config gracefully, maybe show an error
                selectedServer = null; // Ensure selectedServer is null
                serverSelect.innerHTML = '<option>服务器加载失败</option>';
            }

            renderPackageList();
            showWelcomePage(); // Show welcome page initially

        } catch (error) {
            console.error("Error fetching data:", error);
            // Hide progress bar on error
            if (loadingProgressDiv) loadingProgressDiv.style.display = 'none';
            packageList.innerHTML = "<li>加载分组失败</li>";
            if (welcomePage) {
                 welcomePage.innerHTML = `<h2>加载数据失败</h2><p>错误: ${error.message}</p><p>请检查网络连接或文件路径是否正确。</p>`;
                 welcomePage.style.display = 'block';
            }
            if (emojiDisplay) emojiDisplay.style.display = 'none';
            if (currentPackageTitle) currentPackageTitle.textContent = "加载失败";
        }
    }
    // --- Data Fetching with Progress --- END

    // --- Server Selection --- 
    function populateServerSelect() {
        // Ensure config.servers exists and is an array
        if (!config || !config.servers || !Array.isArray(config.servers)) {
             serverSelect.innerHTML = '<option>无可用服务器</option>';
             return;
        }
        serverSelect.innerHTML = "";
        config.servers.forEach(server => {
            const option = document.createElement("option");
            option.value = server.id;
            option.textContent = server.name;
            option.dataset.noReferrer = String(server.noReferrer === true || (server.noReferrer !== false && server.id === 'origin'));
            serverSelect.appendChild(option);
        });
        // Only add listener if there are servers to select
        if (config.servers.length > 0) {
            serverSelect.removeEventListener("change", handleServerChange);
            serverSelect.addEventListener("change", handleServerChange);
        }
    }

    function handleServerChange() {
        updateSelectedServerReferrerPolicy();
        if (selectedServer) {
            localStorage.setItem(SERVER_STORAGE_KEY, selectedServer.id);
        }
        renderPackageList(searchPackagesInput.value);
        const activePackageItem = packageList.querySelector("li.active");
        if (activePackageItem) {
            const packageId = parseFloat(activePackageItem.dataset.packageId);
            const selectedPackage = emojiData.packages.find(pkg => pkg.id === packageId);
            if (selectedPackage) {
                renderEmojiDisplay(selectedPackage);
            }
        }
    }

    function updateSelectedServerReferrerPolicy() {
        const selectedOption = serverSelect.options[serverSelect.selectedIndex];
        // Ensure selectedOption exists before accessing its properties
        if (!selectedOption) return;
        const serverId = selectedOption.value;
        // Ensure config.servers exists and is an array
        if (config.servers && Array.isArray(config.servers)) {
             selectedServer = config.servers.find(s => s.id === serverId);
             if (selectedServer) {
                 selectedServer.noReferrer = selectedOption.dataset.noReferrer === 'true';
             }
        } else {
            selectedServer = null; // Reset if server config is invalid
        }
    }

    // --- URL Helper ---
    function getFullUrl(url) {
        if (!selectedServer || !url) return "";
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (url.includes("{baseURL}")) {
            return url.replace("{baseURL}", selectedServer.baseUrl);
        } else {
            const baseUrl = selectedServer.baseUrl.endsWith('/') ? selectedServer.baseUrl.slice(0, -1) : selectedServer.baseUrl;
            const relativeUrl = url.startsWith('/') ? url.slice(1) : url;
            return `${baseUrl}/${relativeUrl}`;
        }
    }

    // --- Rendering Logic ---
    function renderPackageList(searchTerm = "") {
        if (!packageList || !emojiData || !emojiData.packages) return;
        const lowerSearchTerm = searchTerm.toLowerCase();
        let listHTML = "";
        const activePackageIdStr = packageList.querySelector("li.active")?.dataset.packageId;

        emojiData.packages.forEach(pkg => {
            if (!searchTerm || pkg.text.toLowerCase().includes(lowerSearchTerm)) {
                const iconSrc = getFullUrl(pkg.icon);
                const referrerPolicyAttr = (selectedServer && selectedServer.noReferrer) ? 'referrerpolicy="no-referrer"' : '';
                const isActive = String(pkg.id) === activePackageIdStr;
                listHTML += `
                    <li data-package-id="${pkg.id}" class="${isActive ? 'active' : ''}">
                        ${pkg.icon ? `<img src="${iconSrc}" alt="${pkg.text}" loading="lazy" ${referrerPolicyAttr}>` : '<span style="width: 24px; display: inline-block;"></span>'}
                        <span>${pkg.text}</span>
                    </li>
                `;
            }
        });
        packageList.innerHTML = listHTML || "<li>无匹配分组</li>";
        addPackageListListeners();
    }

    function addPackageListListeners() {
        const items = packageList.querySelectorAll("li");
        items.forEach(item => {
            item.addEventListener("click", () => {
                const currentActive = packageList.querySelector("li.active");
                if (currentActive) {
                    currentActive.classList.remove("active");
                }
                item.classList.add("active");
                const packageId = parseFloat(item.dataset.packageId);
                const selectedPackage = emojiData.packages.find(pkg => pkg.id === packageId);
                if (selectedPackage) {
                    renderEmojiDisplay(selectedPackage);
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('open');
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        });
    }

    function renderEmojiDisplay(pkg) {
        if (!emojiDisplay || !pkg || !welcomePage) return;
        welcomePage.style.display = 'none';
        emojiDisplay.style.display = 'flex';
        currentPackageTitle.textContent = pkg.text;
        emojiDisplay.innerHTML = "";

        pkg.emojis.forEach(emoji => {
            const emojiItem = document.createElement("div");
            emojiItem.className = "emoji-item";
            emojiItem.dataset.emojiName = emoji.name;
            emojiItem.dataset.emojiUrl = emoji.url;

            const img = document.createElement("img");
            const fullUrl = getFullUrl(emoji.url);
            img.dataset.src = fullUrl;
            img.alt = emoji.name;
            if (selectedServer && selectedServer.noReferrer) {
                img.referrerPolicy = "no-referrer";
            } else {
                img.referrerPolicy = "";
            }

            const nameSpan = document.createElement("span");
            nameSpan.textContent = emoji.name;

            emojiItem.appendChild(img);
            emojiItem.appendChild(nameSpan);
            emojiDisplay.appendChild(emojiItem);

            emojiItem.addEventListener("click", () => openCopyModal(emoji.name, emoji.url));
            img.addEventListener("click", (event) => {
                event.stopPropagation();
                openCopyModal(emoji.name, emoji.url);
            });

            observer.observe(img);
        });
    }

    // --- Search Functionality ---
    searchPackagesInput.addEventListener("input", (event) => {
        renderPackageList(event.target.value);
    });

    // --- Lazy Loading with Intersection Observer ---
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (!img.src || img.src !== img.dataset.src) {
                    img.src = img.dataset.src;
                }
                img.onerror = () => {
                    console.error(`Failed to load image: ${img.dataset.src}`);
                    img.alt = `Error: ${img.alt}`;
                    img.style.backgroundColor = '#ffdddd';
                    observer.unobserve(img);
                };
            }
        });
    }, { rootMargin: "0px 0px 300px 0px" });

    // --- Mobile Sidebar Toggle ---
    toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        document.body.classList.toggle('sidebar-open');
    });
    mainContent.addEventListener("click", () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
            sidebar.classList.remove("open");
            document.body.classList.remove('sidebar-open');
        }
    });
    document.body.addEventListener('click', (event) => {
         if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== toggleSidebarBtn) {
            sidebar.classList.remove('open');
            document.body.classList.remove('sidebar-open');
        }
    });

    // --- Sidebar Title Click to Welcome ---
    if (sidebarMainTitle) {
        sidebarMainTitle.style.cursor = 'pointer';
        sidebarMainTitle.addEventListener('click', showWelcomePage);
    }

    // --- Copy Modal Logic ---
    function openCopyModal(name, originalUrl) {
        currentEmojiName = name;
        currentEmojiUrl = getFullUrl(originalUrl);
        const markdownText = `![${currentEmojiName}](${currentEmojiUrl})`;

        modalEmojiName.textContent = currentEmojiName;
        modalEmojiImg.src = currentEmojiUrl;
        if (selectedServer && selectedServer.noReferrer) {
            modalEmojiImg.referrerPolicy = "no-referrer";
        } else {
            modalEmojiImg.referrerPolicy = "";
        }
        urlCopyContent.textContent = currentEmojiUrl;
        mdCopyContent.textContent = markdownText;
        urlCopyFeedback.textContent = "";
        mdCopyFeedback.textContent = "";

        const currentUrlCopyButton = copyModal.querySelector("#copy-url-button");
        const currentMdCopyButton = copyModal.querySelector("#copy-md-button");

        if (currentUrlCopyButton && currentUrlCopyButton.parentNode) {
            const newUrlCopyButton = currentUrlCopyButton.cloneNode(true);
            currentUrlCopyButton.parentNode.replaceChild(newUrlCopyButton, currentUrlCopyButton);
            newUrlCopyButton.addEventListener("click", () => copyText(currentEmojiUrl, urlCopyFeedback, "直链"));
        } else {
            console.error("Could not find URL copy button or its parent.");
        }

        if (currentMdCopyButton && currentMdCopyButton.parentNode) {
            const newMdCopyButton = currentMdCopyButton.cloneNode(true);
            currentMdCopyButton.parentNode.replaceChild(newMdCopyButton, currentMdCopyButton);
            newMdCopyButton.addEventListener("click", () => copyText(markdownText, mdCopyFeedback, "Markdown"));
        } else {
            console.error("Could not find Markdown copy button or its parent.");
        }

        copyModal.style.display = "block";
    }

    // Close modal listeners
    if (modalCloseTopBtn) {
        modalCloseTopBtn.addEventListener("click", () => copyModal.style.display = "none");
    }
    if (modalCloseBottomBtn) {
        modalCloseBottomBtn.addEventListener("click", () => copyModal.style.display = "none");
    }
    window.addEventListener("click", (event) => {
        if (event.target === copyModal) {
            copyModal.style.display = "none";
        }
    });

    // --- Initial Data Load ---
    fetchData();
});

