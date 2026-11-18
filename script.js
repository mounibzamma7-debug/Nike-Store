document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // 1. STORAGE & HELPERS
    // =========================================

    const PRODUCTS_KEY = "nikeProducts";
    const CART_KEY = "nikeCart";
    const ORDERS_KEY = "nikeOrders";
    const FAVORITES_KEY = "nikeFavorites";

    const DELIVERY_FEE = 7;

    const safe = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));

    function readStorage(key, fallback = []) {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            return data ?? fallback;
        } catch (error) {
            console.error(`Error reading ${key}:`, error);
            return fallback;
        }
    }

    function saveStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function money(value) {
        return `${Number(value || 0).toLocaleString("en-US")} TND`;
    }

    function getProduct(productId) {
        return products.find(product =>
            String(product.id) === String(productId)
        );
    }


    // =========================================
    // 2. DEFAULT PRODUCTS & STOCK
    // =========================================

    function initializeProducts() {

        if (localStorage.getItem(PRODUCTS_KEY) !== null) return;

        saveStorage(PRODUCTS_KEY, [
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
                    { name: "Black", image: "aireforceblack.avif" },
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

    let products = readStorage(PRODUCTS_KEY);

    if (!Array.isArray(products)) products = [];

    function migrateStock() {

        let changed = false;

        products = products.map(product => {

            let stock = Number(product.stock);

            if (
                product.stock === undefined ||
                product.stock === null ||
                product.stock === "" ||
                !Number.isFinite(stock)
            ) {
                stock = 10;
                changed = true;
            }

            stock = Math.max(0, Math.floor(stock));

            if (stock !== product.stock) changed = true;

            return { ...product, stock };
        });

        if (changed) saveStorage(PRODUCTS_KEY, products);
    }

    migrateStock();

    // =========================================
// LOAD PRODUCTS FROM SUPABASE
// =========================================
async function loadProductsFromSupabase() {


    try {

        const { data, error } = await window.supabaseClient
            .from("products")
            .select("*")
            .order("created_at", { ascending: false });

            console.log("Supabase raw products:", data);
console.log("Supabase products count:", data?.length);

        if (error) {
            throw error;
        }

        products = Array.isArray(data) ? data : [];

        renderProducts();

        console.log("Store products loaded from Supabase:", products);

    } catch (error) {

        console.error("Supabase store products error:", error);

        alert("Could not load products: " + error.message);
    }
}
// =========================================
// REALTIME PRODUCT UPDATES
// =========================================

const productsChannel = window.supabaseClient
    .channel("store-products-updates")
    .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "products"
        },
        async () => {
            console.log("Products changed in Supabase. Reloading...");
            await loadProductsFromSupabase();
        }
    )
    .subscribe();
    // =========================================
    // 3. PRODUCT DISPLAY + SEARCH
    // =========================================

    let searchTerm = "";

    function colorClass(name) {

        const value = String(name || "").toLowerCase();

        if (value.includes("white")) return "white";
        if (value.includes("black")) return "black";
        if (value.includes("red")) return "red";
        if (value.includes("university")) return "university";
        if (value.includes("blue")) return "blue";

        return "";
    }

    function renderProducts() {

        let container = document.getElementById("dynamicProducts");

        const oldSections = [
            ...document.querySelectorAll(".product-section:not(.dynamic-product)")
        ];

        if (!container) {

            container = document.createElement("div");
            container.id = "dynamicProducts";

            if (oldSections.length) {
                oldSections[0].insertAdjacentElement("beforebegin", container);
            } else {
                const productArea = document.getElementById("product");

                if (!productArea) {
                    console.error("Products section not found.");
                    return;
                }

                productArea.appendChild(container);
            }
        }

        oldSections.forEach(section => section.remove());

        // SEARCH FILTER
        const filteredProducts = products.filter(product => {

            const colors = Array.isArray(product.colors)
                ? product.colors.map(color => color.name)
                : [];

            const searchableText = [
                product.name,
                product.category,
                product.description,
                ...colors
            ].join(" ").toLowerCase();

            return searchableText.includes(searchTerm.toLowerCase());
        });

        container.innerHTML = filteredProducts.map(product => {

            const colors = Array.isArray(product.colors) ? product.colors : [];
            const sizes = Array.isArray(product.sizes) ? product.sizes : [];

            const firstColor = colors[0] || {
                name: "Default",
                image: ""
            };

            const stock = Math.max(0, Number(product.stock) || 0);

            const colorButtons = colors.map((color, index) => `
                <button
                    type="button"
                    class="color-btn ${colorClass(color.name)} ${index === 0 ? "active" : ""}"
                    data-color-index="${index}"
                    title="${safe(color.name)}"
                    aria-label="${safe(color.name)}"
                ></button>
            `).join("");

            const sizeButtons = sizes.map(size => `
                <button
                    type="button"
                    class="size-btn"
                    data-size="${safe(size)}"
                >
                    ${safe(size)}
                </button>
            `).join("");

            return `
                <section
                    class="product-section dynamic-product"
                    id="product-${safe(product.id)}"
                    data-product-id="${safe(product.id)}"
                    data-selected-color="${safe(firstColor.name)}"
                    data-selected-image="${safe(firstColor.image)}"
                    data-selected-size=""
                >

                    <div class="product-image">
                        <span class="image-label">NIKE COLLECTION</span>

                        <img
                            src="${safe(firstColor.image)}"
                            alt="${safe(product.name)}"
                            class="main-shoe"
                            data-main-image
                        >
                    </div>

                    <div class="product-info">

                        <p class="product-category">
                            ${safe(product.category || "NIKE SPORTSWEAR")}
                        </p>

                        <h2>${safe(product.name)}</h2>

                        <p class="price">${money(product.price)}</p>

                        <p class="product-description">
                            ${safe(product.description || "")}
                        </p>

                        <div class="option-group">
                            <h3>
                                Color:
                                <span class="selected-color">
                                    ${safe(firstColor.name)}
                                </span>
                            </h3>

                            <div class="color-options">
                                ${colorButtons}
                            </div>
                        </div>

                        <div class="option-group">
                            <h3>Select Size (EU)</h3>

                            <div class="size-options">
                                ${sizeButtons}
                            </div>
                        </div>

                        <div class="product-actions">

                            <button
                                type="button"
                                class="add-cart"
                                data-add-product="${safe(product.id)}"
                                ${stock <= 0 ? "disabled" : ""}
                            >
                                ${stock <= 0 ? "OUT OF STOCK" : "ADD TO BAG"}
                                <i class="fa-solid fa-bag-shopping"></i>
                            </button>

                            <button
                                type="button"
                                class="favorite-btn"
                                aria-label="Add to favorites"
                            >
                                <i class="fa-regular fa-heart"></i>
                            </button>

                        </div>

                        <p class="shipping-info">
                            <i class="fa-solid fa-truck"></i>
                            Free returns within 30 days
                        </p>

                        <p class="product-stock-info">
                            ${stock > 0 ? `${stock} available` : "Currently unavailable"}
                        </p>

                    </div>
                </section>
            `;

        }).join("") || `
            <div class="search-empty">
                <i class="fa-solid fa-magnifying-glass"></i>
                <h3>No products found</h3>
                <p>Try another product name or keyword.</p>
            </div>
        `;

        updateFavoriteButtons();
    }


    // =========================================
    // 4. SEARCH MODAL
    // =========================================

    const searchBtn = document.getElementById("searchBtn");
    const searchOverlay = document.getElementById("searchOverlay");
    const closeSearch = document.getElementById("closeSearch");
    const searchInput = document.getElementById("productSearchInput");

    function closeSearchModal() {
        searchOverlay?.classList.remove("active");
    }

    function openSearchModal() {

        if (!searchOverlay) {
            console.error("Search overlay not found in HTML.");
            return;
        }

        searchOverlay.classList.add("active");

        if (searchInput) {
            searchInput.value = searchTerm;

            setTimeout(() => {
                searchInput.focus();
            }, 100);
        }
    }

    searchBtn?.addEventListener("click", openSearchModal);

    closeSearch?.addEventListener("click", closeSearchModal);

    searchOverlay?.addEventListener("click", event => {

        if (event.target === searchOverlay) {
            closeSearchModal();
        }
    });

    searchInput?.addEventListener("input", event => {

        searchTerm = event.target.value.trim();

        renderProducts();
    });

    searchInput?.addEventListener("keydown", event => {

        if (event.key === "Enter") {

            event.preventDefault();

            closeSearchModal();

            document.getElementById("dynamicProducts")
                ?.scrollIntoView({ behavior: "smooth" });
        }
    });


    // =========================================
    // 5. COLOR SELECTION
    // =========================================

    document.addEventListener("click", event => {

        const button = event.target.closest(".color-btn");
        if (!button) return;

        const section = button.closest(".product-section");
        if (!section) return;

        const product = getProduct(section.dataset.productId);
        if (!product) return;

        const color = product.colors?.[Number(button.dataset.colorIndex)];
        if (!color) return;

        section.querySelectorAll(".color-btn").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        const image = section.querySelector("[data-main-image]");
        if (image) image.src = color.image;

        const colorText = section.querySelector(".selected-color");
        if (colorText) colorText.textContent = color.name;

        section.dataset.selectedColor = color.name;
        section.dataset.selectedImage = color.image;
    });


    // =========================================
    // 6. SIZE SELECTION
    // =========================================

    document.addEventListener("click", event => {

        const button = event.target.closest(".size-btn");
        if (!button) return;

        const section = button.closest(".product-section");
        if (!section) return;

        section.querySelectorAll(".size-btn").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");
        section.dataset.selectedSize = button.dataset.size;
    });


    // =========================================
    // 7. FAVORITES
    // =========================================

    function readFavorites() {
        const favorites = readStorage(FAVORITES_KEY, []);
        return Array.isArray(favorites) ? favorites : [];
    }

    function updateFavoriteButtons() {

        const favorites = readFavorites();

        document.querySelectorAll(".product-section").forEach(section => {

            const button = section.querySelector(".favorite-btn");
            if (!button) return;

            const productId = section.dataset.productId;
            const active = favorites.includes(productId);
            const icon = button.querySelector("i");

            button.classList.toggle("active", active);

            if (icon) {
                icon.className = active
                    ? "fa-solid fa-heart"
                    : "fa-regular fa-heart";
            }
        });
    }

    document.addEventListener("click", event => {

        const button = event.target.closest(".favorite-btn");
        if (!button) return;

        const section = button.closest(".product-section");
        if (!section) return;

        const productId = section.dataset.productId;
        let favorites = readFavorites();

        if (favorites.includes(productId)) {
            favorites = favorites.filter(id => id !== productId);
        } else {
            favorites.push(productId);
        }

        saveStorage(FAVORITES_KEY, favorites);
        updateFavoriteButtons();
    });


    // =========================================
    // 8. MOBILE MENU
    // =========================================

    const menuBtn = document.getElementById("menuBtn");
    const navbar = document.getElementById("navbar");

    if (menuBtn && navbar) {

        menuBtn.addEventListener("click", () => {
            navbar.classList.toggle("active");
            menuBtn.classList.toggle("active");
        });

        navbar.querySelectorAll("a").forEach(link => {

            link.addEventListener("click", () => {
                navbar.classList.remove("active");
                menuBtn.classList.remove("active");
            });
        });
    }


    // =========================================
    // 9. CART DATA
    // =========================================

    let cart = readStorage(CART_KEY);

    if (!Array.isArray(cart)) cart = [];

    function saveCart() {
        saveStorage(CART_KEY, cart);
    }

    function cartQuantity() {
        return cart.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );
    }

    function cartSubtotal() {
        return cart.reduce(
            (sum, item) =>
                sum + Number(item.price || 0) * Number(item.quantity || 0),
            0
        );
    }

    function updateCartCounter() {

        const count = cartQuantity();

        document.querySelectorAll(
            "#cartCount, #cartCounter, .cart-count, .cart-counter, .cart-badge"
        ).forEach(counter => {
            counter.textContent = count;
            counter.style.display = count > 0 ? "" : "none";
        });
    }

    function quantityInCart(productId) {

        return cart.reduce((sum, item) => {

            if (String(item.productId) !== String(productId)) return sum;

            return sum + Number(item.quantity || 0);

        }, 0);
    }


    // =========================================
    // 10. CART DRAWER
    // =========================================

    const cartDrawer = document.getElementById("cartDrawer");
    const cartOverlay = document.getElementById("cartOverlay");
    const cartItems = document.getElementById("cartItems");
    const cartTotal = document.getElementById("cartTotal");

    function openCart() {

        cartDrawer?.classList.add("active", "open");
        cartOverlay?.classList.add("active", "open");

        document.body.classList.add("cart-open");
    }

    function closeCart() {

        cartDrawer?.classList.remove("active", "open");
        cartOverlay?.classList.remove("active", "open");

        document.body.classList.remove("cart-open");
    }

    document.getElementById("closeCart")?.addEventListener("click", closeCart);
    cartOverlay?.addEventListener("click", closeCart);

    document.getElementById("continueShopping")?.addEventListener(
        "click",
        closeCart
    );

    document.querySelectorAll(
        "#cartBtn, #cartIcon, .cart-icon, .cart-button, [data-open-cart], .header-icons a[aria-label='Shopping bag']"
    ).forEach(button => {

        button.addEventListener("click", event => {
            event.preventDefault();
            openCart();
        });
    });


    // =========================================
    // 11. RENDER CART
    // =========================================

    function renderCart() {

        if (!cartItems || !cartTotal) {
            updateCartCounter();
            return;
        }

        if (!cart.length) {

            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fa-solid fa-bag-shopping"></i>
                    <h3>Your bag is empty</h3>
                    <p>Discover your next favorite pair.</p>
                </div>
            `;

            cartTotal.textContent = money(0);
            updateCartCounter();

            return;
        }

        cartItems.innerHTML = cart.map((item, index) => `
            <div class="cart-item">

                <img src="${safe(item.image)}" alt="${safe(item.name)}">

                <div class="cart-item-info">
                    <h3>${safe(item.name)}</h3>
                    <p>${safe(item.color)} · EU ${safe(item.size)}</p>

                    <strong>${money(item.price)}</strong>

                    <div class="cart-quantity">

                        <button
                            type="button"
                            data-cart-action="decrease"
                            data-cart-index="${index}"
                        >−</button>

                        <span>${Number(item.quantity || 1)}</span>

                        <button
                            type="button"
                            data-cart-action="increase"
                            data-cart-index="${index}"
                        >+</button>

                    </div>
                </div>

                <button
                    type="button"
                    class="remove-cart-item"
                    data-cart-action="remove"
                    data-cart-index="${index}"
                    aria-label="Remove product"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>

            </div>
        `).join("");

        cartTotal.textContent = money(cartSubtotal());
        updateCartCounter();
    }


    // =========================================
    // 12. ADD TO CART + STOCK VALIDATION
    // =========================================

    function addToCart(productId, section) {

       

        const product = getProduct(productId);

        if (!product) {
            alert("This product is no longer available.");
            return;
        }

        const stock = Math.max(0, Number(product.stock) || 0);

        if (stock <= 0) {
            alert("Sorry, this product is out of stock.");
            return;
        }

        const selectedSize = section.dataset.selectedSize;

        if (!selectedSize) {
            alert("Please select a size before adding this product.");
            return;
        }

        const selectedColorName =
            section.dataset.selectedColor || product.colors?.[0]?.name;

        const color = product.colors?.find(item =>
            item.name === selectedColorName
        );

        if (!color) {
            alert("Please select an available color.");
            return;
        }

        const currentQuantity = quantityInCart(product.id);

        if (currentQuantity + 1 > stock) {
            alert(`Only ${stock} units are available for this product.`);
            return;
        }

        const existing = cart.find(item =>
            String(item.productId) === String(product.id) &&
            item.color === color.name &&
            String(item.size) === String(selectedSize)
        );

        if (existing) {
            existing.quantity++;
        } else {
            cart.push({
                productId: product.id,
                name: product.name,
                image: color.image,
                color: color.name,
                size: selectedSize,
                price: Number(product.price),
                quantity: 1
            });
        }

        saveCart();
        renderCart();
        openCart();
    }

    document.addEventListener("click", event => {

        const button = event.target.closest("[data-add-product]");
        if (!button) return;

        const section = button.closest(".product-section");
        if (!section) return;

        addToCart(button.dataset.addProduct, section);
    });


    // =========================================
    // 13. CART QUANTITY / REMOVE
    // =========================================

    cartItems?.addEventListener("click", event => {

        const button = event.target.closest("[data-cart-action]");
        if (!button) return;

        const index = Number(button.dataset.cartIndex);
        const action = button.dataset.cartAction;

        if (!cart[index]) return;

        if (action === "increase") {

            const item = cart[index];
            const product = getProduct(item.productId);

            if (!product) {
                alert("This product is no longer available.");
                return;
            }

            const stock = Math.max(0, Number(product.stock) || 0);
            const currentQuantity = quantityInCart(product.id);

            if (currentQuantity + 1 > stock) {
                alert(`Only ${stock} units are available.`);
                return;
            }

            item.quantity++;
        }

        if (action === "decrease") {

            cart[index].quantity--;

            if (cart[index].quantity <= 0) {
                cart.splice(index, 1);
            }
        }

        if (action === "remove") {
            cart.splice(index, 1);
        }

        saveCart();
        renderCart();
    });


    // =========================================
    // 14. CHECKOUT
    // =========================================

    const checkoutPage = document.getElementById("checkoutPage");
    const checkoutForm = document.getElementById("checkoutForm");
    const orderSuccess = document.getElementById("orderSuccess");

    function openCheckout() {

        if (!cart.length) {
            alert("Your shopping bag is empty.");
            return;
        }

        if (!checkoutPage || !checkoutForm) {
            alert("Checkout form was not found in index.html.");
            return;
        }

        if (!validateCartStock()) return;

        renderCheckoutSummary();
        closeCart();

        checkoutPage.classList.add("active");
    }

    function closeCheckout() {
        checkoutPage?.classList.remove("active");
    }

    function renderCheckoutSummary() {

        const itemsContainer = document.getElementById("checkoutItems");
        const subtotalElement = document.getElementById("checkoutSubtotal");
        const totalElement = document.getElementById("checkoutTotal");

        if (itemsContainer) {

            itemsContainer.innerHTML = cart.map(item => `
                <div class="checkout-item">

                    <img
                        src="${safe(item.image)}"
                        alt="${safe(item.name)}"
                    >

                    <div class="checkout-product-info">
                        <h4>${safe(item.name)}</h4>

                        <p>
                            ${safe(item.color)} · EU ${safe(item.size)}
                            · Qty ${Number(item.quantity)}
                        </p>
                    </div>

                    <strong>
                        ${money(Number(item.price) * Number(item.quantity))}
                    </strong>

                </div>
            `).join("");
        }

        const subtotal = cartSubtotal();
        const total = subtotal + DELIVERY_FEE;

        if (subtotalElement) {
            subtotalElement.textContent = money(subtotal);
        }

        if (totalElement) {
            totalElement.textContent = money(total);
        }

        const deliveryElement = document.getElementById("deliveryFee");

        if (deliveryElement) {
            deliveryElement.textContent = money(DELIVERY_FEE);
        }
    }

    document.getElementById("checkoutBtn")?.addEventListener(
        "click",
        openCheckout
    );

    document.getElementById("closeCheckout")?.addEventListener(
        "click",
        closeCheckout
    );


    // =========================================
    // 15. VALIDATE CART STOCK
    // =========================================

    function validateCartStock() {

       

        const quantities = new Map();
if (cart.some(item =>
    !Number.isInteger(Number(item.quantity)) ||
    Number(item.quantity) <= 0
)) {
    alert("Invalid product quantity in your bag.");
    return false;
}

       cart.forEach(item => {

    const id = String(item.productId || "");
    const quantity = Number(item.quantity);

    if (!id || !Number.isInteger(quantity) || quantity <= 0) {
        return;
    }

            quantities.set(
                id,
                (quantities.get(id) || 0) + Number(item.quantity || 0)
            );
        });

        for (const [productId, quantity] of quantities) {

            const product = getProduct(productId);

            if (!product) {
                alert("A product in your bag is no longer available.");
                return false;
            }

            const stock = Math.max(0, Number(product.stock) || 0);

            if (quantity > stock) {
                alert(
                    `${product.name}: only ${stock} units are currently available. Please update your bag.`
                );
                return false;
            }
        }

        return true;
    }


    // =========================================
    // 16. ORDER SUCCESS DISPLAY
    // =========================================

    function renderOrderSuccess(order) {

        if (!orderSuccess) return;

        const orderId = document.getElementById("successOrderId");
        const orderDate = document.getElementById("successOrderDate");
        const orderItems = document.getElementById("successOrderItems");
        const orderTotal = document.getElementById("successOrderTotal");

        if (orderId) {
            orderId.textContent = "#" + order.id;
        }

        if (orderDate) {

            const date = new Date(order.date);

            orderDate.textContent = date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }

        if (orderItems) {

            orderItems.innerHTML = order.items.map(item => `

                <div class="success-product-item">

                    <img
                        src="${safe(item.image)}"
                        alt="${safe(item.name)}"
                    >

                    <div class="success-product-info">

                        <strong>${safe(item.name)}</strong>

                        <p>
                            ${safe(item.color)}
                            · EU ${safe(item.size)}
                            · Qty ${Number(item.quantity)}
                        </p>

                    </div>

                    <strong class="success-product-price">
                        ${money(Number(item.price) * Number(item.quantity))}
                    </strong>

                </div>

            `).join("");
        }

        if (orderTotal) {
            orderTotal.textContent = money(order.total);
        }

        orderSuccess.classList.add("active");
    }


    // =========================================
    // 17. PLACE ORDER
    // =========================================

    
async function submitOrder(event) {
console.log("SUBMIT ORDER FUNCTION STARTED");
    event.preventDefault();

    if (!cart.length) {
        alert("Your shopping bag is empty.");
        closeCheckout();
        return;
    }

    if (!validateCartStock()) return;

    const customer = {
        name: document.getElementById("customerName")?.value.trim() || "",
        email: document.getElementById("customerEmail")?.value.trim() || "",
        phone: document.getElementById("customerPhone")?.value.trim() || "",
        city: document.getElementById("customerCity")?.value.trim() || "",
        address: document.getElementById("customerAddress")?.value.trim() || "",
        postal: document.getElementById("customerPostal")?.value.trim() || ""
    };

    if (Object.values(customer).some(value => !value)) {
        alert("Please complete all delivery information.");
        return;
    }

    const paymentInput = document.querySelector(
        'input[name="payment"]:checked'
    );

    const payment = paymentInput?.value || "Cash on Delivery";

    if (payment === "Bank Card") {
        alert(
            "Card payment is not available yet. Please select Cash on Delivery."
        );
        return;
    }


    if (!Array.isArray(products) || !validateCartStock()) return;

    const subtotal = cartSubtotal();
    const total = subtotal + DELIVERY_FEE;

    const orderItems = cart.map(item => ({
        productId: item.productId,
        name: item.name,
        image: item.image,
        color: item.color,
        size: item.size,
        price: Number(item.price),
        quantity: Number(item.quantity)
    }));

    const order = {
        id: "NK-" + Date.now(),
        date: new Date().toISOString(),
        customer,
        items: orderItems,
        subtotal,
        delivery: DELIVERY_FEE,
        total,
        payment: "Cash on Delivery",
        status: "New"
    };
    console.log("CHECK 1: submitOrder started");
console.log("CHECK 2: Cart items:", cart);
console.log("CHECK 3: Sending order to Supabase...");
// Save order and update stock in Supabase
const { error } = await window.supabaseClient
    .rpc("place_order", {
        p_order: order
    });

if (error) {
    console.error("Supabase order error:", error);
    alert("Could not place your order: " + error.message);
    return;
}

    // Reload latest products and stock from Supabase
await loadProductsFromSupabase();

    cart = [];

    saveCart();
    renderCart();
    renderProducts();

    closeCheckout();

    renderOrderSuccess(order);
}

    checkoutForm?.addEventListener("submit", submitOrder);


    // =========================================
    // 18. FINISH ORDER
    // =========================================

    orderSuccess?.addEventListener("click", event => {

        const button = event.target.closest("#finishOrder");

        if (!button) return;

        orderSuccess.classList.remove("active");

        checkoutForm?.reset();
    });


    // =========================================
    // 19. KEYBOARD
    // =========================================

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            closeCart();
            closeCheckout();
            closeSearchModal();
            orderSuccess?.classList.remove("active");
        }
    });


    // =========================================
    // 20. SYNC WITH ADMIN
    // =========================================

    window.addEventListener("storage", event => {

        if (event.key === PRODUCTS_KEY) {

            products = readStorage(PRODUCTS_KEY);

            if (!Array.isArray(products)) products = [];

            renderProducts();
        }

        if (event.key === CART_KEY) {

            cart = readStorage(CART_KEY);

            if (!Array.isArray(cart)) cart = [];

            renderCart();
        }

        if (event.key === ORDERS_KEY) {
            console.log("Orders updated from another tab.");
        }
    });


    // =========================================
    // 21. INITIALIZE STORE
    // =========================================

    renderProducts();
    renderCart();
    updateCartCounter();
loadProductsFromSupabase();
});