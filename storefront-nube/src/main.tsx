/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Text } from "@tiendanube/nube-sdk-jsx";
import { STOREFRONT_UI_SLOT, type NubeSDK } from "@tiendanube/nube-sdk-types";

const PRIMARY_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART;
const FALLBACK_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_PRICE;

function DiagnosticBlock() {
  return (
    <Box
      background="#ffffff"
      borderRadius="8px"
      direction="col"
      gap="6px"
      padding="16px"
      style={{
        borderColor: "#16a34a",
        borderStyle: "solid",
        borderWidth: "1px",
        margin: "16px 0",
      }}
    >
      <Text heading={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Compre Junto NubeSDK ativo
      </Text>
      <Text color="#52525b" style={{ fontSize: "14px", margin: 0 }}>
        Renderização de teste
      </Text>
    </Box>
  );
}

export function App(nube: NubeSDK) {
  console.info("Compre Junto NubeSDK iniciado.", {
    fallbackSlot: FALLBACK_SLOT,
    mode: "diagnostic-static-render",
    primarySlot: PRIMARY_SLOT,
  });

  nube.render(PRIMARY_SLOT, <DiagnosticBlock />);
  nube.render(FALLBACK_SLOT, <DiagnosticBlock />);

  console.info("Compre Junto NubeSDK renderização diagnóstica solicitada.", {
    fallbackSlot: FALLBACK_SLOT,
    primarySlot: PRIMARY_SLOT,
  });
}
