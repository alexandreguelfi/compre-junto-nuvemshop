/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Text } from "@tiendanube/nube-sdk-jsx";
import { STOREFRONT_UI_SLOT, type NubeSDK } from "@tiendanube/nube-sdk-types";

const DIAGNOSTIC_SLOTS = [
  STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART,
  STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_PRICE,
  STOREFRONT_UI_SLOT.BEFORE_PRODUCT_DETAIL_ADD_TO_CART,
] as const;

function logDiagnostic(message: string, details: Record<string, unknown> = {}) {
  console.info(message, details);
}

function DiagnosticBlock() {
  return (
    <Box
      background="#ffffff"
      borderRadius="8px"
      direction="col"
      gap="8px"
      padding="16px"
      style={{
        borderColor: "#e5e7eb",
        borderStyle: "solid",
        borderWidth: "1px",
        margin: "16px 0",
      }}
    >
      <Text heading={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Compre Junto NubeSDK #7880 ativo
      </Text>
      <Text color="#52525b" style={{ fontSize: "14px", margin: 0 }}>
        Teste isolado sem script legado
      </Text>
    </Box>
  );
}

export function App(nube: NubeSDK) {
  logDiagnostic("Compre Junto NubeSDK #7880 bootstrap", {
    mode: "fixed-diagnostic-render",
    slots: DIAGNOSTIC_SLOTS,
  });

  for (const slot of DIAGNOSTIC_SLOTS) {
    logDiagnostic("Tentando renderizar slot", { slot });
    nube.render(slot, <DiagnosticBlock />);
    logDiagnostic("Renderização diagnóstica enviada", { slot });
  }
}
