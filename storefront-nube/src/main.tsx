/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Text } from "@tiendanube/nube-sdk-jsx";
import { STOREFRONT_UI_SLOT, type NubeSDK } from "@tiendanube/nube-sdk-types";

const RESET_SLOTS = [
  STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART,
  STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_PRICE,
  STOREFRONT_UI_SLOT.BEFORE_PRODUCT_DETAIL_ADD_TO_CART,
] as const;

function ResetBlock() {
  return (
    <Box
      background="#ffffff"
      borderRadius="8px"
      direction="col"
      gap="8px"
      padding="16px"
      style={{
        borderColor: "#22c55e",
        borderStyle: "solid",
        borderWidth: "2px",
        margin: "16px 0",
      }}
    >
      <Text heading={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Compre Junto NubeSDK RESET v6
      </Text>
      <Text color="#52525b" style={{ fontSize: "14px", margin: 0 }}>
        Teste limpo sem legado
      </Text>
    </Box>
  );
}

export function App(nube: NubeSDK) {
  console.info("Compre Junto NubeSDK RESET v6 bootstrap", {
    slots: RESET_SLOTS,
  });

  for (const slot of RESET_SLOTS) {
    nube.render(slot, <ResetBlock />);
    console.info("Compre Junto NubeSDK RESET v6 render enviado", {
      slot,
    });
  }
}
