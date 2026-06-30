const widgetScript = String.raw`
(function () {
  function getCurrentScript() {
    if (document.currentScript) {
      return document.currentScript;
    }

    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1] || null;
  }

  function getDataValue(script, name) {
    if (!script) {
      return "";
    }

    if (script.dataset && script.dataset[name]) {
      return script.dataset[name];
    }

    return script.getAttribute("data-" + name.replace(/[A-Z]/g, "-$&").toLowerCase()) || "";
  }

  function cleanId(value) {
    if (typeof value === "number" && isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    return "";
  }

  function readKnownId(source, keys) {
    var index;
    var value;

    if (!source || typeof source !== "object") {
      return cleanId(source);
    }

    for (index = 0; index < keys.length; index += 1) {
      value = cleanId(source[keys[index]]);

      if (value) {
        return value;
      }
    }

    return "";
  }

  function readScriptQuery(script, key) {
    if (!script || !script.src) {
      return "";
    }

    try {
      return cleanId(new URL(script.src, window.location.href).searchParams.get(key));
    } catch (error) {
      return "";
    }
  }

  function getLs() {
    return window.LS && typeof window.LS === "object" ? window.LS : null;
  }

  function detectProductId(script) {
    var dataProductId = cleanId(getDataValue(script, "productId"));
    var ls = getLs();

    if (dataProductId) {
      return dataProductId;
    }

    return ls
      ? readKnownId(ls.product, ["id", "productId", "product_id", "id_product", "nuvemshopProductId"])
      : "";
  }

  function detectStoreId(script) {
    var dataStoreId = cleanId(getDataValue(script, "storeId"));
    var scriptStoreId;
    var ls = getLs();

    if (dataStoreId) {
      return dataStoreId;
    }

    scriptStoreId = readScriptQuery(script, "store");

    if (scriptStoreId) {
      return scriptStoreId;
    }

    return ls ? readKnownId(ls.store, ["id", "storeId", "store_id", "id_store", "nuvemshopStoreId"]) : "";
  }

  function insertAfter(target, element) {
    if (!target || !target.parentNode) {
      return false;
    }

    target.parentNode.insertBefore(element, target.nextSibling);
    return true;
  }

  function findContainer(script) {
    var container =
      document.getElementById("compre-junto-widget") || document.querySelector("[data-compre-junto-widget]");
    var productArea;

    if (container) {
      return container;
    }

    container = document.createElement("div");
    productArea = document.querySelector('[data-store^="product-info"], [data-store^="product-form"]');

    if (insertAfter(productArea, container)) {
      return container;
    }

    if (insertAfter(script, container)) {
      return container;
    } else if (document.body) {
      document.body.appendChild(container);
    }

    return container;
  }

  function applyStyles(root, title, text, productName, button) {
    root.style.cssText =
      "box-sizing:border-box;margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#18181b;font-family:Arial,Helvetica,sans-serif;line-height:1.4;";
    title.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:700;color:#18181b;";
    text.style.cssText = "margin:0 0 6px;font-size:14px;color:#52525b;";
    productName.style.cssText = "margin:0 0 12px;font-size:15px;font-weight:700;color:#18181b;";
    button.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 14px;border:0;border-radius:6px;background:#18181b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;";
  }

  function renderOffer(container, offer) {
    var root = document.createElement("div");
    var title = document.createElement("h2");
    var text = document.createElement("p");
    var productName = document.createElement("p");
    var button = document.createElement("button");

    title.textContent = "Compre junto";
    text.textContent = "Combine este produto com:";
    productName.textContent = offer.suggestedProduct.name;
    button.type = "button";
    button.textContent = "Ver produto sugerido";
    button.setAttribute("data-suggested-product-id", offer.suggestedProduct.id);
    button.addEventListener("click", function () {
      window.dispatchEvent(
        new CustomEvent("compre-junto:view-suggested-product", {
          detail: {
            productId: offer.principalProductId,
            suggestedProduct: offer.suggestedProduct,
          },
        })
      );
    });

    applyStyles(root, title, text, productName, button);

    root.appendChild(title);
    root.appendChild(text);
    root.appendChild(productName);
    root.appendChild(button);

    container.innerHTML = "";
    container.appendChild(root);
  }

  function buildOfferUrl(script, productId, storeId) {
    var baseUrl = script && script.src ? script.src : window.location.href;
    var url = new URL("/api/public/offers", baseUrl);

    url.searchParams.set("productId", productId);

    if (storeId) {
      url.searchParams.set("storeId", storeId);
    }

    return url;
  }

  var script = getCurrentScript();
  var productId = detectProductId(script);
  var storeId = detectStoreId(script);

  if (!productId) {
    return;
  }

  fetch(buildOfferUrl(script, productId, storeId), {
    headers: {
      Accept: "application/json",
    },
  })
    .then(function (response) {
      if (!response.ok) {
        return null;
      }

      return response.json();
    })
    .then(function (payload) {
      if (!payload || !payload.offer) {
        return;
      }

      renderOffer(findContainer(script), payload.offer);
    })
    .catch(function () {});
})();
`;

export const dynamic = "force-static";
export const runtime = "nodejs";

export async function GET() {
  return new Response(widgetScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
