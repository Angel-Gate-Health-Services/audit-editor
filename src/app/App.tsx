import { LazyMotion, MotionConfig } from 'motion/react';
import { RouterProvider } from 'react-router';
import { router } from './router.tsx';

const loadFeatures = () => import('./motion/features.ts').then((m) => m.default);

export function App() {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </LazyMotion>
  );
}
