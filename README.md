# SmartFreight Optimizer & Decision Hub

A local-only (no backend, no external APIs) freight packing + carrier decision
tool. Built with React (Vite), Tailwind CSS, Three.js via `@react-three/fiber`,
and `lucide-react`. All data persists in the browser via `localStorage`.

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build   # outputs to /dist
npm run preview # serve the production build locally to sanity-check it
```

## Project structure

```
src/
  data/
    containers.js     # LTL pallet / U-Box preset geometry + weight caps
    storage.js         # localStorage read/write helpers + seed inventory
  hooks/
    useInventory.js    # CRUD state for the goods database (persisted)
    useShipment.js      # current order, container choice, route, accessorials (persisted)
  utils/
    binPacking.js       # 3D bin-packing heuristic (layer + shelf placement)
    pricingEngine.js     # simulated carrier rates + rule-based surcharges
  components/
    Header.jsx
    InventoryManager.jsx  # left panel: goods database CRUD
    ShipmentBuilder.jsx    # left panel: quantities, route, accessorials
    ContainerTabs.jsx       # pallet / U-Box selector
    ContainerViewer3D.jsx    # react-three-fiber 3D scene
    LoadingStepSlider.jsx     # step-by-step loading guide
    ControlTower.jsx           # right panel: decision cards + readouts
    DecisionCard.jsx            # single carrier option card
  App.jsx                        # layout + state wiring
```

## Deploying to Vercel (free tier)

See the deployment walkthrough provided alongside this project.
