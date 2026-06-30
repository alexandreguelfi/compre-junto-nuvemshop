const widgetScript = String.raw`
(function () {
  function getCurrentScript() {
    if (document.currentScript) {
      return document.currentScript;
    }

    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1] || null;
  }

  function findContainer(script) {
    var container =
      document.getElementById("compre-junto-widget") || document.querySelector("[data-compre-junto-widget]");

    if (container) {
      return container;
    }

    container = document.createElement("div");

    if (script && script.parentNode) {
      script.parentNode.insertBefore(container, script.nextSibling);
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
  var productId = script && script.dataset ? script.dataset.productId : "";
  var storeId = script && script.dataset ? script.dataset.storeId : "";

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
