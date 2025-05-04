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
    const sidebarMainTitle = document.getElementById("sidebar-main-title"); // Added sidebar title reference

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

    // State Variables
    let emojiData = { packages: [] };
    let config = { servers: [] };
    let selectedServer = null;
    let currentEmojiUrl = "";
    let currentEmojiName = "";
    const defaultWelcomeTitle = "欢迎使用 Emoji Explorer"; // Store default title
    const SERVER_STORAGE_KEY = 'selectedEmojiServerId'; // Key for localStorage

    // --- Function to Show Welcome Page ---
    function showWelcomePage() {
        if (welcomePage) welcomePage.style.display = 'block';
        if (emojiDisplay) emojiDisplay.style.display = 'none';
        if (currentPackageTitle) currentPackageTitle.textContent = defaultWelcomeTitle;
        // Remove active class from any selected package
        const currentActive = packageList.querySelector("li.active");
        if (currentActive) {
            currentActive.classList.remove("active");
        }
    }

    // --- Data Fetching ---
    async function fetchData() {
        try {
            const [configRes, emojiRes] = await Promise.all([
                fetch("data/config.json"),
                fetch("data/emoji_data.json")
            ]);
            if (!configRes.ok) throw new Error(`HTTP error! status: ${configRes.status}`);
            config = await configRes.json();
            if (!emojiRes.ok) throw new Error(`HTTP error! status: ${emojiRes.status}`);
            emojiData = await emojiRes.json();

            populateServerSelect();

            // --- Load selected server from localStorage --- START
            const savedServerId = localStorage.getItem(SERVER_STORAGE_KEY);
            let initialServerId = "origin"; // Default to origin
            if (savedServerId && config.servers.some(s => s.id === savedServerId)) {
                initialServerId = savedServerId;
            }
            selectedServer = config.servers.find(s => s.id === initialServerId);
            if (selectedServer) {
                serverSelect.value = selectedServer.id;
                updateSelectedServerReferrerPolicy(); // Ensure policy is set based on loaded selection
            } else {
                 // Fallback if saved ID is invalid or origin doesn't exist (shouldn't happen with default)
                 selectedServer = config.servers.length > 0 ? config.servers[0] : null;
                 if (selectedServer) {
                    serverSelect.value = selectedServer.id;
                    updateSelectedServerReferrerPolicy();
                 }
            }
            // --- Load selected server from localStorage --- END

            renderPackageList();
            // Show welcome page initially
            showWelcomePage();
        } catch (error) {
            console.error("Error fetching data:", error);
            packageList.innerHTML = "<li>加载分组失败</li>";
            if (welcomePage) {
                 welcomePage.innerHTML = "<h2>加载数据失败</h2><p>请检查网络连接或配置文件。</p>";
                 welcomePage.style.display = 'block'; // Ensure welcome page is visible on error
            }
            if (emojiDisplay) emojiDisplay.style.display = 'none';
            if (currentPackageTitle) currentPackageTitle.textContent = "加载失败";
        }
    }

    // --- Server Selection --- 
    function populateServerSelect() {
        if (!config || !config.servers) return;
        serverSelect.innerHTML = "";
        config.servers.forEach(server => {
            const option = document.createElement("option");
            option.value = server.id;
            option.textContent = server.name;
            // Store noReferrer policy directly on the option for easier access later
            option.dataset.noReferrer = String(server.noReferrer === true || (server.noReferrer !== false && server.id === 'origin'));
            serverSelect.appendChild(option);
        });
        serverSelect.removeEventListener("change", handleServerChange);
        serverSelect.addEventListener("change", handleServerChange);
    }

    function handleServerChange() {
        updateSelectedServerReferrerPolicy();
        // --- Save selected server to localStorage --- START
        if (selectedServer) {
            localStorage.setItem(SERVER_STORAGE_KEY, selectedServer.id);
        }
        // --- Save selected server to localStorage --- END

        // Re-render the package list to update icons
        renderPackageList(searchPackagesInput.value);

        // Re-render the emoji display if a package is active
        const activePackageItem = packageList.querySelector("li.active");
        if (activePackageItem) {
            const packageId = parseFloat(activePackageItem.dataset.packageId);
            const selectedPackage = emojiData.packages.find(pkg => pkg.id === packageId);
            if (selectedPackage) {
                renderEmojiDisplay(selectedPackage);
            }
        } else {
             // If no package is active, ensure welcome page isn't shown over potentially stale emoji display
             // showWelcomePage(); // Or simply do nothing if welcome is already shown
        }
    }

    function updateSelectedServerReferrerPolicy() {
        const selectedOption = serverSelect.options[serverSelect.selectedIndex];
        const serverId = selectedOption.value;
        selectedServer = config.servers.find(s => s.id === serverId);
        // Update the noReferrer status based on the selected option's data attribute
        if (selectedServer && selectedOption) {
            selectedServer.noReferrer = selectedOption.dataset.noReferrer === 'true';
        }
    }

    // --- URL Helper ---
    function getFullUrl(url) {
        if (!selectedServer || !url) return "";
        // If URL is already absolute, return it directly
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        // If URL contains {baseURL} placeholder, replace it
        if (url.includes("{baseURL}")) {
            return url.replace("{baseURL}", selectedServer.baseUrl);
        } else {
            // Otherwise, construct the full URL by joining baseUrl and relative url
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
                const iconSrc = getFullUrl(pkg.icon); // Get full URL based on current selectedServer
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
        addPackageListListeners(); // Re-attach listeners after updating innerHTML
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
                    // Close sidebar on mobile after selection
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

        // Hide welcome page and show emoji display
        welcomePage.style.display = 'none';
        emojiDisplay.style.display = 'flex'; // Use 'flex' as defined in CSS

        currentPackageTitle.textContent = pkg.text;
        emojiDisplay.innerHTML = ""; // Clear previous emojis - this forces re-creation

        pkg.emojis.forEach(emoji => {
            const emojiItem = document.createElement("div");
            emojiItem.className = "emoji-item";
            emojiItem.dataset.emojiName = emoji.name;
            emojiItem.dataset.emojiUrl = emoji.url; // Store original relative/placeholder URL

            const img = document.createElement("img");
            const fullUrl = getFullUrl(emoji.url); // Get full URL based on current selectedServer
            img.dataset.src = fullUrl; // Set dataset for lazy loading
            img.alt = emoji.name;
            if (selectedServer && selectedServer.noReferrer) {
                img.referrerPolicy = "no-referrer";
            } else {
                img.referrerPolicy = ""; // Reset policy if not needed
            }

            const nameSpan = document.createElement("span");
            nameSpan.textContent = emoji.name;

            emojiItem.appendChild(img);
            emojiItem.appendChild(nameSpan);
            emojiDisplay.appendChild(emojiItem);

            // Add click listener to the whole item
            emojiItem.addEventListener("click", () => openCopyModal(emoji.name, emoji.url));
            // Add click listener specifically to the image
            img.addEventListener("click", (event) => {
                event.stopPropagation(); // Prevent triggering the emojiItem listener twice
                openCopyModal(emoji.name, emoji.url);
            });

            // Observe the image for lazy loading
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
                // Only set src if it's not already set or if it differs from dataset.src (optional check)
                if (!img.src || img.src !== img.dataset.src) {
                    img.src = img.dataset.src;
                }
                // No need to unobserve immediately on load, let it handle potential re-intersections if needed
                // img.onload = () => observer.unobserve(img); // Removed this line
                img.onerror = () => {
                    console.error(`Failed to load image: ${img.dataset.src}`);
                    img.alt = `Error: ${img.alt}`;
                    img.style.backgroundColor = '#ffdddd';
                    observer.unobserve(img); // Unobserve on error
                };
            }
        });
    }, { rootMargin: "0px 0px 300px 0px" });

    // --- Mobile Sidebar Toggle ---
    toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        document.body.classList.toggle('sidebar-open');
    });
    // Close sidebar when clicking on main content area
    mainContent.addEventListener("click", () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
            sidebar.classList.remove("open");
            document.body.classList.remove('sidebar-open');
        }
    });
    // Close sidebar when clicking outside of it on mobile
    document.body.addEventListener('click', (event) => {
         if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== toggleSidebarBtn) {
            sidebar.classList.remove('open');
            document.body.classList.remove('sidebar-open');
        }
    });

    // --- Sidebar Title Click to Welcome ---
    if (sidebarMainTitle) {
        sidebarMainTitle.style.cursor = 'pointer'; // Add pointer cursor
        sidebarMainTitle.addEventListener('click', showWelcomePage);
    }

    // --- Copy Modal Logic ---
    function openCopyModal(name, originalUrl) {
        currentEmojiName = name;
        currentEmojiUrl = getFullUrl(originalUrl); // Use originalUrl to construct current full URL
        const markdownText = `![${currentEmojiName}](${currentEmojiUrl})`;

        // Update modal content
        modalEmojiName.textContent = currentEmojiName;
        modalEmojiImg.src = currentEmojiUrl;
        if (selectedServer && selectedServer.noReferrer) {
            modalEmojiImg.referrerPolicy = "no-referrer";
        } else {
            modalEmojiImg.referrerPolicy = "";
        }
        urlCopyContent.textContent = currentEmojiUrl;
        mdCopyContent.textContent = markdownText;
        urlCopyFeedback.textContent = ""; // Clear feedback
        mdCopyFeedback.textContent = ""; // Clear feedback

        // --- Dynamic Button Listeners (Clone & Replace Method) ---
        // Re-query buttons inside the function to ensure we have the latest nodes
        const currentUrlCopyButton = copyModal.querySelector("#copy-url-button");
        const currentMdCopyButton = copyModal.querySelector("#copy-md-button");

        // Clone, replace, and add listener for URL button
        if (currentUrlCopyButton && currentUrlCopyButton.parentNode) {
            const newUrlCopyButton = currentUrlCopyButton.cloneNode(true);
            currentUrlCopyButton.parentNode.replaceChild(newUrlCopyButton, currentUrlCopyButton);
            newUrlCopyButton.addEventListener("click", () => copyText(currentEmojiUrl, urlCopyFeedback, "直链"));
        } else {
            console.error("Could not find URL copy button or its parent.");
        }

        // Clone, replace, and add listener for Markdown button
        if (currentMdCopyButton && currentMdCopyButton.parentNode) {
            const newMdCopyButton = currentMdCopyButton.cloneNode(true);
            currentMdCopyButton.parentNode.replaceChild(newMdCopyButton, currentMdCopyButton);
            newMdCopyButton.addEventListener("click", () => copyText(markdownText, mdCopyFeedback, "Markdown"));
        } else {
            console.error("Could not find Markdown copy button or its parent.");
        }
        // --- End Dynamic Button Listeners ---

        // Show the modal
        copyModal.style.display = "block";
    }

    // Close modal listeners
    if (modalCloseTopBtn) {
        modalCloseTopBtn.addEventListener("click", () => copyModal.style.display = "none");
    }
    if (modalCloseBottomBtn) {
        modalCloseBottomBtn.addEventListener("click", () => copyModal.style.display = "none");
    }
    // Close modal if clicking outside of it
    window.addEventListener("click", (event) => {
        if (event.target === copyModal) {
            copyModal.style.display = "none";
        }
    });

    // --- Initial Data Load ---
    fetchData();
});

