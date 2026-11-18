
document.addEventListener("DOMContentLoaded", () => {



    // =========================================
    // ADMIN AUTHENTICATION - SUPABASE
    // =========================================

    const loginForm = document.getElementById("adminLoginForm");
    const loginError = document.getElementById("loginError");
    const loginButton = document.getElementById("loginButton");

    function setAuthenticated(isAuthenticated) {
        document.body.classList.toggle("authenticated", isAuthenticated);
    }

   async function checkAdminSession() {

    const { data, error } = await window.supabaseClient.auth.getSession();

    if (error) {
        console.error("Session error:", error.message);
        setAuthenticated(false);
        return false;
    }

    const adminUID = "3cc499fb-be9d-4d84-a682-ab3871ed3028";

    const isAdmin = data.session?.user?.id === adminUID;

    setAuthenticated(isAdmin);

    return isAdmin;
}

    // Login
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        loginError.textContent = "";
        loginButton.disabled = true;
        loginButton.textContent = "SIGNING IN...";

        const email = document.getElementById("adminEmail").value.trim();
        const password = document.getElementById("adminPassword").value;

        const { data, error } =
            await window.supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            loginError.textContent = "Invalid email or password.";
            console.error("Login error:", error.message);
            setAuthenticated(false);
        } else {
            setAuthenticated(!!data.session);
            loginForm.reset();
        }

        loginButton.disabled = false;
        loginButton.textContent = "SIGN IN";
    });

    // Logout / session changes
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        setAuthenticated(!!session);
    });

    checkAdminSession();
    // Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
    const { error } = await window.supabaseClient.auth.signOut();

    if (error) {
        alert("Logout failed: " + error.message);
        return;
    }

    setAuthenticated(false);
});

    // =========================================
    // 1. STORAGE & HELPERS
    // =========================================

  

    const readProducts = () => {
        try {
            const data = JSON.parse(localStorage.getItem("nikeProducts"));
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    };

    const saveProducts = products => {
        localStorage.setItem("nikeProducts", JSON.stringify(products));
    };

   

    const money = value =>
        `${Number(value || 0).toLocaleString("en-US")} TND`;

    const safe = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));

    const STATUSES = [
        "New",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled"
    ];

   let orders = [];
let products = readProducts();

// Supabase products
let productsLoaded = false;
let productsLoading = false;

    // =========================================
    // 2. INITIAL PRODUCTS
    // =========================================

    function initializeProducts() {

        if (localStorage.getItem("nikeProducts") !== null) return;

        saveProducts([
            {
                id: "nike-af1",
                name: "Nike Air Force 1 '07",
                price: 299,
                category: "NIKE SPORTSWEAR",
                description: "Classic Nike Air Force 1 '07.",
                stock: 10,
                sizes: ["39", "40", "41", "42", "43", "44"],
                colors: [
                    { name: "White", image: "airee.jpg" },
                    { name: "Black", image: "black.jpg" },
                    { name: "Red", image: "red.jpg" },
                    { name: "Blue", image: "bleu.jpg" }
                ]
            },
            {
                id: "nike-dunk",
                name: "Nike Dunk Low",
                price: 279,
                category: "NIKE SPORTSWEAR",
                description: "Nike Dunk Low sneakers.",
                stock: 10,
                sizes: ["39", "40", "41", "42", "43", "44"],
                colors: [
                    { name: "White", image: "blanche.jpg" },
                    { name: "University Blue", image: "bleuu.jpg" }
                ]
            }
        ]);
    }

    initializeProducts();
    products = readProducts();


    // =========================================
    // 3. STOCK MIGRATION
    // =========================================

    function migrateProductStock() {

        let changed = false;

        products = products.map(product => {

            if (
                product.stock === undefined ||
                product.stock === null ||
                product.stock === ""
            ) {
                changed = true;

                return {
                    ...product,
                    stock: 10
                };
            }

            const stock = Math.max(
                0,
                Math.floor(Number(product.stock) || 0)
            );

            if (stock !== product.stock) {
                changed = true;
            }

            return {
                ...product,
                stock
            };
        });

        if (changed) {
            saveProducts(products);
        }
    }

    migrateProductStock();


    // =========================================
// 4. LOAD PRODUCTS FROM SUPABASE
// =========================================

async function loadProductsFromSupabase() {

    if (productsLoading) return;

    productsLoading = true;

    try {

        // Get products from Supabase
        let { data, error } = await window.supabaseClient
            .from("products")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        // If Supabase is empty, migrate old local products
        if (data.length === 0) {

            const oldProducts = readProducts();

            if (oldProducts.length > 0) {

                const { error: insertError } =
                    await window.supabaseClient
                        .from("products")
                        .insert(oldProducts);

                if (insertError) {
                    throw insertError;
                }

                // Load migrated products
                const result = await window.supabaseClient
                    .from("products")
                    .select("*")
                    .order("created_at", { ascending: false });

                if (result.error) {
                    throw result.error;
                }

                data = result.data;
            }
        }

        products = data || [];
        productsLoaded = true;

        refresh();

        console.log("Products loaded from Supabase:", products);

    } catch (error) {

        console.error("Supabase products error:", error.message);

        alert("Could not load products from Supabase: " + error.message);

    } finally {

        productsLoading = false;
    }
}
async function loadOrdersFromSupabase() {

    const { data, error } = await window.supabaseClient
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Supabase orders error:", error);
        alert("Could not load orders: " + error.message);
        return;
    }


    orders = data || [];
    refresh();
}

// =========================================
// REALTIME - ORDERS UPDATES
// =========================================

const ordersChannel = window.supabaseClient
    .channel("admin-orders-updates")
    .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "orders"
        },
        async () => {
            console.log("Orders changed in Supabase. Reloading...");
            await loadOrdersFromSupabase();
        }
    )
    .subscribe((status, error) => {
    console.log("Orders Realtime status:", status);

    if (error) {
        console.error("Orders Realtime error:", error);
    }
});
    // =========================================
    // 4. NAVIGATION
    // =========================================

    const pages = ["dashboard", "orders", "products", "customers"];

    const titles = {
        dashboard: "Dashboard",
        orders: "Orders",
        products: "Products",
        customers: "Customers"
    };

    function navigate(page) {

        if (!pages.includes(page)) page = "dashboard";

        document.querySelectorAll(".page").forEach(el => {
            el.classList.toggle("active", el.id === `page-${page}`);
        });

        document.querySelectorAll(".side-nav a").forEach(el => {
            el.classList.toggle("active", el.dataset.page === page);
        });

        document.getElementById("pageTitle").textContent = titles[page];

        history.replaceState(null, "", `#${page}`);

        document.getElementById("sidebar").classList.remove("open");
    }

    document.querySelectorAll(".side-nav a").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            navigate(link.dataset.page);
        });
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            navigate(button.dataset.go);
        });
    });

    document.getElementById("mobileMenu").addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("open");
    });

    document.getElementById("refreshBtn").addEventListener("click", refresh);

    document.getElementById("todayDate").textContent =
        new Date().toLocaleDateString("en-US", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });


    // =========================================
    // 5. HELPERS
    // =========================================

    function statusClass(status) {
        return String(status || "New").toLowerCase();
    }

    function dateText(value) {

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
    }

    function customerName(order) {
        return order.customer?.name || "Guest";
    }

    function itemCount(order) {
        return (order.items || []).reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );
    }
async function updateOrderStatus(orderId, newStatus) {

    if (!STATUSES.includes(newStatus)) return false;

    try {

        const { error } = await window.supabaseClient
            .from("orders")
            .update({ status: newStatus })
            .eq("id", orderId);

        if (error) throw error;

        await loadOrdersFromSupabase();

        return true;

    } catch (error) {

        console.error("Supabase update order error:", error);

        alert("Could not update order: " + error.message);

        return false;
    }
}
    // =========================================
    // 6. REFRESH
    // =========================================

function refresh() {

  

    renderDashboard();
    renderOrders();
    renderCustomers();
    renderProducts();

    document.getElementById("ordersBadge").textContent = orders.length;
}

    // =========================================
    // 7. DASHBOARD
    // =========================================

    function renderDashboard() {

        const revenue = orders
            .filter(order => order.status !== "Cancelled")
            .reduce((sum, order) => {
                return sum + Number(order.total || 0);
            }, 0);

        const unique = new Set(
            orders.map(order =>
                String(
                    order.customer?.email ||
                    order.customer?.phone ||
                    customerName(order)
                ).toLowerCase()
            )
        );

        document.getElementById("statOrders").textContent =
            orders.length;

        document.getElementById("statRevenue").textContent =
            money(revenue);

        document.getElementById("statCustomers").textContent =
            unique.size;

        const productsElement = document.getElementById("statProducts");

        if (productsElement) {
            productsElement.textContent = products.length;
        }

        document.getElementById("statNew").textContent =
            orders.filter(order =>
                (order.status || "New") === "New"
            ).length;


        // Recent Orders

        document.getElementById("recentOrders").innerHTML =
            orders.slice(0, 5).map(order => `
                <tr>
                    <td class="order-id">${safe(order.id)}</td>
                    <td>${safe(customerName(order))}</td>
               <td>${dateText(order.date || order.created_at)}</td>               
               <td>${money(order.total)}</td>
                    <td>
                        <span class="status ${statusClass(order.status)}">
                            ${safe(order.status || "New")}
                        </span>
                    </td>
                </tr>
            `).join("");

        if (!orders.length) {
            document.getElementById("recentOrders").innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;color:#999;padding:30px">
                        No orders yet. Place a test order in your store.
                    </td>
                </tr>
            `;
        }


        // Products Overview

        const overview = document.getElementById("overviewProducts");

        if (overview) {

            overview.innerHTML = products.slice(0, 4).map(product => `
                <div class="overview-product">
                    <img
                        src="${safe(product.colors?.[0]?.image || "")}"
                        alt="${safe(product.name)}"
                    >

                    <div>
                        <strong>${safe(product.name)}</strong>
                        <p>${money(product.price)}</p>
                        <small>Stock: ${Number(product.stock || 0)}</small>
                    </div>
                </div>
            `).join("");

            if (!products.length) {
                overview.innerHTML = "<p>No products available.</p>";
            }
        }


        // Monthly Sales Chart

        const chartCanvas = document.getElementById("salesChart");

        if (chartCanvas && window.Chart) {

            const currentYear = new Date().getFullYear();

            const monthlyRevenue = Array(12).fill(0);

            orders.forEach(order => {

                if (order.status === "Cancelled") return;

const orderDate = new Date(order.date || order.created_at);
                if (
                    Number.isNaN(orderDate.getTime()) ||
                    orderDate.getFullYear() !== currentYear
                ) return;

                monthlyRevenue[orderDate.getMonth()] +=
                    Number(order.total || 0);
            });

            const months = [
                "Jan", "Feb", "Mar", "Apr",
                "May", "Jun", "Jul", "Aug",
                "Sep", "Oct", "Nov", "Dec"
            ];

            if (window.salesChartInstance) {
                window.salesChartInstance.destroy();
            }

            window.salesChartInstance = new Chart(chartCanvas, {

                type: "bar",

                data: {
                    labels: months,

                    datasets: [{
                        label: "Revenue",
                        data: monthlyRevenue,

                        backgroundColor: months.map((month, index) =>
                            index === new Date().getMonth()
                                ? "#ff5a1f"
                                : "rgba(255, 90, 31, 0.35)"
                        ),

                        hoverBackgroundColor: "#ff5a1f",
                        borderRadius: 7,
                        borderSkipped: false,
                        barThickness: 24,
                        maxBarThickness: 32
                    }]
                },

                options: {

                    responsive: true,
                    maintainAspectRatio: false,

                    animation: {
                        duration: 800,
                        easing: "easeOutQuart"
                    },

                    plugins: {

                        legend: {
                            display: false
                        },

                        tooltip: {
                            backgroundColor: "#171717",
                            titleColor: "#ffffff",
                            bodyColor: "#ffffff",
                            padding: 12,
                            cornerRadius: 8,

                            callbacks: {
                                label: context =>
                                    " " + context.parsed.y.toLocaleString("en-US") + " TND"
                            }
                        }
                    },

                    scales: {

                        y: {
                            beginAtZero: true,

                            ticks: {
                                color: "#888",
                                padding: 10,
                                callback: value => value + " TND"
                            },

                            grid: {
                                color: "rgba(0,0,0,0.06)",
                                drawBorder: false
                            },

                            border: {
                                display: false
                            }
                        },

                        x: {
                            ticks: {
                                color: "#777"
                            },

                            grid: {
                                display: false
                            },

                            border: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
    }


    // =========================================
    // 8. ORDERS
    // =========================================

    function renderOrders() {

        const query = document.getElementById("orderSearch").value
            .trim()
            .toLowerCase();

        const status = document.getElementById("statusFilter").value;

        const filtered = orders.filter(order => {

            const searchable = `
                ${order.id}
                ${customerName(order)}
                ${order.customer?.email || ""}
                ${order.customer?.phone || ""}
            `.toLowerCase();

            return searchable.includes(query) &&
                (status === "all" || (order.status || "New") === status);
        });

        document.getElementById("ordersTable").innerHTML =
            filtered.map(order => {

                const currentStatus = order.status || "New";

                return `
                    
                    <tr>
    <td>
        <input
            type="checkbox"
            class="order-checkbox"
            value="${safe(order.id)}"
            aria-label="Select order"
        >
    </td>

    <td class="order-id">${safe(order.id)}</td>
                        <td>${safe(customerName(order))}</td>
                        <td>${dateText(order.date)}</td>
                        <td>${itemCount(order)}</td>
                        <td><strong>${money(order.total)}</strong></td>

                        <td>
                            <select
                                class="status-select table-status-select"
                                data-order-status="${safe(order.id)}"
                                aria-label="Change order status"
                            >
                                ${STATUSES.map(status => `
                                    <option
                                        value="${status}"
                                        ${currentStatus === status ? "selected" : ""}
                                    >
                                        ${status}
                                    </option>
                                `).join("")}
                            </select>
                        </td>

                        <td>
                            <button class="small-action" data-view="${safe(order.id)}">
                                View
                            </button>
                        </td>
                    </tr>
                `;
            }).join("");

        document.getElementById("ordersEmpty").classList.toggle(
            "show",
            filtered.length === 0
        );
    }
    // Select all visible orders
document.getElementById("selectAllOrders").addEventListener("change", event => {

    document.querySelectorAll("#ordersTable .order-checkbox").forEach(checkbox => {
        checkbox.checked = event.target.checked;
    });

});

// Update Select All state
document.getElementById("ordersTable").addEventListener("change", event => {

    if (!event.target.classList.contains("order-checkbox")) return;

    const checkboxes = [
        ...document.querySelectorAll("#ordersTable .order-checkbox")
    ];

    const checkedCount = checkboxes.filter(cb => cb.checked).length;

    const selectAll = document.getElementById("selectAllOrders");

    selectAll.checked = checkboxes.length > 0 &&
        checkedCount === checkboxes.length;

    selectAll.indeterminate =
        checkedCount > 0 && checkedCount < checkboxes.length;

});

// Delete selected orders
document.getElementById("deleteSelectedOrders").addEventListener("click", async () => {

    const selectedIds = [
        ...document.querySelectorAll("#ordersTable .order-checkbox:checked")
    ].map(checkbox => checkbox.value);

    if (selectedIds.length === 0) {
        alert("Please select at least one order.");
        return;
    }

    if (!confirm(`Delete ${selectedIds.length} selected order(s)?`)) return;

    const { error } = await window.supabaseClient
        .from("orders")
        .delete()
        .in("id", selectedIds);

    if (error) {
        alert("Could not delete orders: " + error.message);
        return;
    }

    document.getElementById("selectAllOrders").checked = false;
    document.getElementById("selectAllOrders").indeterminate = false;

    await loadOrdersFromSupabase();

    alert("Selected orders deleted successfully.");
});


// Update order status
document.getElementById("ordersTable").addEventListener("change", event => {

    const select = event.target.closest("[data-order-status]");

    if (!select) return;

    updateOrderStatus(
        select.dataset.orderStatus,
        select.value
    );
});

    document.getElementById("ordersTable").addEventListener("change", event => {

        const select = event.target.closest("[data-order-status]");

        if (!select) return;

        updateOrderStatus(
            select.dataset.orderStatus,
            select.value
        );
    });

    document.getElementById("orderSearch").addEventListener("input", renderOrders);

    document.getElementById("statusFilter").addEventListener("change", renderOrders);


    // =========================================
    // 9. CUSTOMERS
    // =========================================

    function renderCustomers() {

        const customers = new Map();

        orders.forEach(order => {

            const customer = order.customer || {};

            const key = String(
                customer.email ||
                customer.phone ||
                customer.name ||
                "guest"
            ).toLowerCase();

            if (!customers.has(key)) {
                customers.set(key, {
                    customer,
                    count: 0,
                    spent: 0
                });
            }

            const entry = customers.get(key);

            entry.count++;

            if (order.status !== "Cancelled") {
                entry.spent += Number(order.total || 0);
            }
        });

        document.getElementById("customersTable").innerHTML =
            [...customers.values()].map(entry => `
                <tr>
                    <td><strong>${safe(entry.customer.name || "Guest")}</strong></td>
                    <td>${safe(entry.customer.email || "—")}</td>
                    <td>${safe(entry.customer.phone || "—")}</td>
                    <td>${safe(entry.customer.city || "—")}</td>
                    <td>${entry.count}</td>
                    <td><strong>${money(entry.spent)}</strong></td>
                </tr>
            `).join("");

        document.getElementById("customersEmpty").classList.toggle(
            "show",
            customers.size === 0
        );
    }


    // =========================================
    // 10. PRODUCT STOCK STATISTICS
    // =========================================

    function renderProductStats() {

        const total = products.length;

        const inStock = products.filter(product =>
            Number(product.stock) >= 5
        ).length;

        const lowStock = products.filter(product =>
            Number(product.stock) > 0 &&
            Number(product.stock) < 5
        ).length;

        const outOfStock = products.filter(product =>
            Number(product.stock) === 0
        ).length;

        document.getElementById("productTotalCount").textContent = total;
        document.getElementById("productInStockCount").textContent = inStock;
        document.getElementById("productLowStockCount").textContent = lowStock;
        document.getElementById("productOutStockCount").textContent = outOfStock;
    }


    // =========================================
    // 11. PRODUCT CATEGORY FILTER
    // =========================================

    function renderCategoryFilter() {

        const select = document.getElementById("categoryFilter");

        const selectedCategory = select.value || "all";

        const categories = [
            ...new Set(
                products
                    .map(product => product.category || "NIKE SPORTSWEAR")
                    .filter(Boolean)
            )
        ].sort();

        select.innerHTML = `
            <option value="all">All Categories</option>

            ${categories.map(category => `
                <option value="${safe(category)}">
                    ${safe(category)}
                </option>
            `).join("")}
        `;

        if (categories.includes(selectedCategory)) {
            select.value = selectedCategory;
        } else {
            select.value = "all";
        }
    }


    // =========================================
    // 12. PRODUCTS DISPLAY + SEARCH
    // =========================================

    function renderProducts() {

        const grid = document.getElementById("productsGrid");
        const empty = document.getElementById("productsEmpty");

        const searchInput = document.getElementById("productSearch");
        const categorySelect = document.getElementById("categoryFilter");

   const query = searchInput.value.trim().toLowerCase();

renderProductStats();
renderCategoryFilter();

const selectedCategory = categorySelect.value;

        const filteredProducts = products.filter(product => {

            const matchesName = String(product.name || "")
                .toLowerCase()
                .includes(query);

            const category = product.category || "NIKE SPORTSWEAR";

            const matchesCategory =
                selectedCategory === "all" ||
                category === selectedCategory;

            return matchesName && matchesCategory;
        });

        if (!filteredProducts.length) {

            grid.innerHTML = "";

            empty.style.display = "block";

            empty.innerHTML = products.length
                ? `<i class="fa-solid fa-magnifying-glass"></i>
                   No products match your search.`
                : `<i class="fa-solid fa-box-open"></i>
                   No products found. Add your first product.`;

            return;
        }

        empty.style.display = "none";

        grid.innerHTML = filteredProducts.map(product => {

            const colors = (product.colors || [])
                .map(color => color.name)
                .join(", ");

            const image = product.colors?.[0]?.image || "";

            const stock = Math.max(0, Number(product.stock) || 0);

            let stockClass = "stock-ok";
            let stockText = "In Stock";

            if (stock === 0) {
                stockClass = "stock-out";
                stockText = "Out of Stock";
            } else if (stock < 5) {
                stockClass = "stock-low";
                stockText = "Low Stock";
            }

            return `
                <article class="product-card">

                    <img
                        src="${safe(image)}"
                        alt="${safe(product.name)}"
                        onerror="this.style.opacity='.2'"
                    >

                    <div class="product-card-info">

                        <p>${safe(product.category || "NIKE SPORTSWEAR")}</p>

                        <h3>${safe(product.name)}</h3>

                        <p>Colors: ${safe(colors || "None")}</p>

                        <strong>${money(product.price)}</strong>

                        <div class="product-stock">
                            <span class="stock-badge ${stockClass}">
                                ${stockText}
                            </span>

                            <span class="stock-quantity">
                                ${stock} units
                            </span>
                        </div>

                        <div class="product-actions">

                            <button
                                class="edit-product-btn"
                                data-edit-product="${safe(product.id)}"
                            >
                                <i class="fa-solid fa-pen"></i>
                                Edit
                            </button>

                            <button
                                class="delete-product-btn"
                                data-delete-product="${safe(product.id)}"
                            >
                                <i class="fa-solid fa-trash"></i>
                                Delete
                            </button>

                        </div>

                    </div>
                </article>
            `;
        }).join("");
    }

    document.getElementById("productSearch").addEventListener(
        "input",
        renderProducts
    );

    document.getElementById("categoryFilter").addEventListener(
        "change",
        renderProducts
    );


    // =========================================
    // 13. PRODUCT MODAL
    // =========================================

    const productModal = document.getElementById("productModal");
    const productForm = document.getElementById("productForm");
    const colorsContainer = document.getElementById("productColors");

    function addColorRow(name = "", image = "") {

        const row = document.createElement("div");

        row.className = "color-form-row";

        row.innerHTML = `
            <div class="form-group">
                <label>Color Name</label>

                <input
                    type="text"
                    class="color-name-input"
                    placeholder="White"
                    value="${safe(name)}"
                    required
                >
            </div>

            <div class="form-group">
                <label>Image Path / URL</label>

                <input
                    type="text"
                    class="color-image-input"
                    placeholder="images/white.jpg"
                    value="${safe(image)}"
                    required
                >
            </div>

            <button
                type="button"
                class="remove-color-btn"
                title="Remove color"
            >
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        row.querySelector(".remove-color-btn").addEventListener("click", () => {
            row.remove();
        });

        colorsContainer.appendChild(row);
    }

    function openProductModal(product = null) {

        productForm.reset();
        colorsContainer.innerHTML = "";

        if (product) {

            document.getElementById("productModalTitle").textContent = "Edit Product";
            document.getElementById("productId").value = product.id;
            document.getElementById("productName").value = product.name || "";
            document.getElementById("productPrice").value = product.price ?? "";

            document.getElementById("productCategory").value =
                product.category || "NIKE SPORTSWEAR";

            document.getElementById("productStock").value =
                Number(product.stock ?? 10);

            document.getElementById("productDescription").value =
                product.description || "";

            document.getElementById("productSizes").value =
                (product.sizes || []).join(", ");

            (product.colors || []).forEach(color => {
                addColorRow(color.name, color.image);
            });

        } else {

            document.getElementById("productModalTitle").textContent = "Add Product";
            document.getElementById("productId").value = "";

            document.getElementById("productCategory").value = "NIKE SPORTSWEAR";
            document.getElementById("productStock").value = 10;
            document.getElementById("productSizes").value = "39, 40, 41, 42, 43, 44";

            addColorRow();
        }

        productModal.classList.add("open");
    }

    function closeProductModal() {
        productModal.classList.remove("open");
    }

    document.getElementById("addProductBtn").addEventListener("click", () => {
        openProductModal();
    });

    document.getElementById("closeProductModal").addEventListener(
        "click",
        closeProductModal
    );

    document.getElementById("cancelProduct").addEventListener(
        "click",
        closeProductModal
    );

    document.getElementById("addColorRow").addEventListener("click", () => {
        addColorRow();
    });

    productModal.addEventListener("click", event => {
        if (event.target === productModal) closeProductModal();
    });


    // =========================================
    // 14. SAVE PRODUCT
    // =========================================

    
productForm.addEventListener("submit", async event => {

    event.preventDefault();

    const id = document.getElementById("productId").value;
    const name = document.getElementById("productName").value.trim();
    const price = Number(document.getElementById("productPrice").value);
    const category = document.getElementById("productCategory").value.trim();

    const stockInput = document.getElementById("productStock").value;
    const stock = Number(stockInput);

    const description =
        document.getElementById("productDescription").value.trim();

    const sizes = document.getElementById("productSizes").value
        .split(",")
        .map(size => size.trim())
        .filter(Boolean);

    const colors = [];

    colorsContainer.querySelectorAll(".color-form-row").forEach(row => {

        const colorName =
            row.querySelector(".color-name-input").value.trim();

        const colorImage =
            row.querySelector(".color-image-input").value.trim();

        if (colorName && colorImage) {
            colors.push({
                name: colorName,
                image: colorImage
            });
        }
    });

    if (!name || !Number.isFinite(price) || price < 0) {
        alert("Please enter a valid product name and price.");
        return;
    }

    if (
        stockInput.trim() === "" ||
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        alert("Please enter a valid stock quantity.");
        return;
    }

    if (!colors.length || !sizes.length) {
        alert("Please add at least one color and one size.");
        return;
    }

    const productData = {
        id: id || `product-${Date.now()}`,
        name,
        price,
        category: category || "NIKE SPORTSWEAR",
        description,
        stock,
        sizes,
        colors
    };

    const saveButton = document.getElementById("saveProductBtn");

    saveButton.disabled = true;

    try {

        let result;

        if (id) {

            result = await window.supabaseClient
                .from("products")
                .update(productData)
                .eq("id", id);

        } else {

            result = await window.supabaseClient
                .from("products")
                .insert([productData]);

        }

        if (result.error) {
            throw result.error;
        }

        await loadProductsFromSupabase();

        closeProductModal();

        alert(id
            ? "Product updated successfully!"
            : "Product added successfully!"
        );

    } catch (error) {

        console.error("Product save error:", error);

        alert("Could not save product: " + error.message);

    } finally {

        saveButton.disabled = false;
    }
});

    // =========================================
    // 15. EDIT / DELETE PRODUCT
    // =========================================

// =========================================
// 15. EDIT / DELETE PRODUCT
// =========================================

document.getElementById("productsGrid").addEventListener("click", async event => {

    const editButton = event.target.closest("[data-edit-product]");
    const deleteButton = event.target.closest("[data-delete-product]");

    if (editButton) {

        const product = products.find(
            item => item.id === editButton.dataset.editProduct
        );

        if (product) openProductModal(product);
    }

    if (deleteButton) {

        const productId = deleteButton.dataset.deleteProduct;

        const product = products.find(item => item.id === productId);

        if (!product) return;

        const confirmed = confirm(
            `Are you sure you want to delete "${product.name}"?`
        );

        if (!confirmed) return;

        try {

            const { error } = await window.supabaseClient
                .from("products")
                .delete()
                .eq("id", productId);

            if (error) {
                throw error;
            }

            await loadProductsFromSupabase();

            alert("Product deleted successfully!");

        } catch (error) {

            console.error("Product delete error:", error);

            alert("Could not delete product: " + error.message);
        }
    }
});


    // =========================================
    // 16. ORDER DETAILS MODAL
    // =========================================

    const modal = document.getElementById("orderModal");

    function openOrder(orderId) {

        const order = orders.find(item => item.id === orderId);

        if (!order) return;

        const customer = order.customer || {};
        const items = order.items || [];

        const subtotal = Number(
            order.subtotal ??
            items.reduce((sum, item) =>
                sum + Number(item.price || 0) * Number(item.quantity || 1),
                0
            )
        );

        const delivery = Number(order.delivery || 0);
        const total = Number(order.total || subtotal + delivery);
        const currentStatus = order.status || "New";

        document.getElementById("modalOrderTitle").textContent =
            `Order ${order.id}`;

        document.getElementById("orderDetails").innerHTML = `

            <div class="order-details-layout">

                <section class="order-detail-section">

                    <div class="order-section-heading">
                        <h3>Customer Information</h3>
                        <span class="order-detail-icon">👤</span>
                    </div>

                    <div class="order-info-grid">

                        <div class="order-info-card">
                            <small>Full Name</small>
                            <strong>${safe(customer.name || "Guest")}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>Email</small>
                            <strong>${safe(customer.email || "—")}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>Phone</small>
                            <strong>${safe(customer.phone || "—")}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>City</small>
                            <strong>${safe(customer.city || "—")}</strong>
                        </div>

                        <div class="order-info-card full-width">
                            <small>Delivery Address</small>
                            <strong>${safe(customer.address || "—")}</strong>
                        </div>

                    </div>
                </section>

                <section class="order-detail-section">

                    <div class="order-section-heading">
                        <h3>Order Information</h3>
                        <span class="order-detail-icon">📦</span>
                    </div>

                    <div class="order-info-grid">

                        <div class="order-info-card">
                            <small>Order ID</small>
                            <strong>${safe(order.id)}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>Order Date</small>
                            <strong>${dateText(order.date)}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>Payment Method</small>
                            <strong>${safe(order.payment || "Cash on Delivery")}</strong>
                        </div>

                        <div class="order-info-card">
                            <small>Items Quantity</small>
                            <strong>${itemCount(order)} items</strong>
                        </div>

                    </div>
                </section>

                <section class="order-detail-section">

                    <div class="order-section-heading">
                        <h3>Ordered Products</h3>

                        <span class="order-items-count">
                            ${items.length}
                            ${items.length === 1 ? "Product" : "Products"}
                        </span>
                    </div>

                    <div class="order-products-list">

                        ${items.map(item => `
                            <div class="order-product-row">

                                <img
                                    class="order-product-image"
                                    src="${safe(item.image || "")}"
                                    alt="${safe(item.name || "Product")}"
                                    onerror="this.style.display='none'"
                                >

                                <div class="order-product-info">
                                    <strong>${safe(item.name || "Nike Product")}</strong>

                                    <p>
                                        Color: ${safe(item.color || "—")}
                                        · Size: ${safe(item.size || "—")}
                                    </p>

                                    <small>
                                        Quantity: ${Number(item.quantity || 1)}
                                    </small>
                                </div>

                                <strong class="order-product-price">
                                    ${money(
                                        Number(item.price || 0) *
                                        Number(item.quantity || 1)
                                    )}
                                </strong>

                            </div>
                        `).join("")}

                        ${items.length === 0
                            ? '<p class="order-no-items">No products found.</p>'
                            : ""
                        }

                    </div>
                </section>

                <section class="order-detail-section">

                    <div class="order-section-heading">
                        <h3>Payment Summary</h3>
                        <span class="order-detail-icon">💳</span>
                    </div>

                    <div class="order-summary">

                        <div>
                            <span>Subtotal</span>
                            <strong>${money(subtotal)}</strong>
                        </div>

                        <div>
                            <span>Delivery</span>
                            <strong>${money(delivery)}</strong>
                        </div>

                        <div class="order-grand-total">
                            <span>Total</span>
                            <strong>${money(total)}</strong>
                        </div>

                    </div>
                </section>

                <section class="order-detail-section order-status-section">

                    <div>
                        <h3>Update Order Status</h3>
                        <p>Choose the current status of this order.</p>
                    </div>

                    <select class="status-select" id="modalStatus">
                        ${STATUSES.map(status => `
                            <option
                                value="${status}"
                                ${currentStatus === status ? "selected" : ""}
                            >
                                ${status}
                            </option>
                        `).join("")}
                    </select>

                </section>

            </div>
        `;

document.getElementById("modalStatus").addEventListener("change", async event => {

    const success = await updateOrderStatus(orderId, event.target.value);

    if (success) {
        openOrder(orderId);
    }
});
        modal.classList.add("open");
    }

    document.getElementById("ordersTable").addEventListener("click", event => {

        const button = event.target.closest("[data-view]");

        if (button) {
            openOrder(button.dataset.view);
        }
    });

    document.getElementById("closeModal").addEventListener("click", () => {
        modal.classList.remove("open");
    });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.classList.remove("open");
        }
    });


    // =========================================
    // 17. EXPORT ORDERS CSV
    // =========================================

    function csvSafe(value) {

        let text = String(value ?? "");

        if (/^[=+\-@\t\r]/.test(text)) {
            text = "'" + text;
        }

        return `"${text.replace(/"/g, '""')}"`;
    }

    document.getElementById("exportOrders").addEventListener("click", () => {

        if (!orders.length) {
            alert("There are no orders to export.");
            return;
        }

        const rows = [[
            "Order ID",
            "Date",
            "Customer",
            "Email",
            "Phone",
            "City",
            "Address",
            "Items",
            "Subtotal",
            "Delivery",
            "Total",
            "Payment",
            "Status"
        ]];

        orders.forEach(order => {

            rows.push([
                order.id,
                order.date,
                order.customer?.name || "",
                order.customer?.email || "",
                order.customer?.phone || "",
                order.customer?.city || "",
                order.customer?.address || "",
                (order.items || []).map(item =>
                    `${item.name} (${item.color}, EU ${item.size}) x${item.quantity}`
                ).join(" | "),
                order.subtotal || 0,
                order.delivery || 0,
                order.total || 0,
                order.payment || "",
                order.status || "New"
            ]);
        });

        const csv = rows.map(row =>
            row.map(csvSafe).join(",")
        ).join("\r\n");

        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "nike-orders.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    });


    // =========================================
    // 18. AUTOMATIC UPDATES
    // =========================================

    window.addEventListener("storage", event => {

     if (event.key === "nikeProducts") {
    refresh();
}
    });

    window.addEventListener("focus", refresh);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            refresh();
        }
    });

  

    // =========================================
    // 19. KEYBOARD
    // =========================================

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            modal.classList.remove("open");
            closeProductModal();
        }
    });


    // =========================================
    // 20. INITIALIZE
    // =========================================

   navigate(location.hash.replace("#", "") || "dashboard");

refresh();

checkAdminSession().then(isAdmin => {

    if (!isAdmin) return;

    loadProductsFromSupabase();
    loadOrdersFromSupabase();

});
});
