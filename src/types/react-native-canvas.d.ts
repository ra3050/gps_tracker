declare module 'react-native-canvas' {
  import {Component} from 'react';
  import {ViewProps} from 'react-native';

  export interface CanvasProps extends ViewProps {
    ref?: React.RefObject<Canvas>;
  }

  export default class Canvas extends Component<CanvasProps> {
    width: number;
    height: number;
    getContext(contextId: '2d'): CanvasRenderingContext2D;
  }
}
