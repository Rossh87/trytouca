// automatically generated by the FlatBuffers compiler, do not modify

import { Array, ArrayT } from './array'
import { Blob, BlobT } from './blob'
import { Bool, BoolT } from './bool'
import { Double, DoubleT } from './double'
import { Float, FloatT } from './float'
import { Int, IntT } from './int'
import { Object_, ObjectT } from './object'
import { String, StringT } from './string'
import { UInt, UIntT } from './uint'

export enum Type {
  NONE = 0,
  Bool = 1,
  Int = 2,
  UInt = 3,
  Float = 4,
  Double = 5,
  String = 6,
  Object_ = 7,
  Array = 8,
  Blob = 9
}

export function unionToType(
  type: Type,
  accessor: (
    obj: Array | Blob | Bool | Double | Float | Int | Object_ | String | UInt
  ) =>
    | Array
    | Blob
    | Bool
    | Double
    | Float
    | Int
    | Object_
    | String
    | UInt
    | null
): Array | Blob | Bool | Double | Float | Int | Object_ | String | UInt | null {
  switch (Type[type]) {
    case 'NONE':
      return null
    case 'Bool':
      return accessor(new Bool())! as Bool
    case 'Int':
      return accessor(new Int())! as Int
    case 'UInt':
      return accessor(new UInt())! as UInt
    case 'Float':
      return accessor(new Float())! as Float
    case 'Double':
      return accessor(new Double())! as Double
    case 'String':
      return accessor(new String())! as String
    case 'Object':
      return accessor(new Object_())! as Object_
    case 'Array':
      return accessor(new Array())! as Array
    case 'Blob':
      return accessor(new Blob())! as Blob
    default:
      return null
  }
}

export function unionListToType(
  type: Type,
  accessor: (
    index: number,
    obj: Array | Blob | Bool | Double | Float | Int | Object_ | String | UInt
  ) =>
    | Array
    | Blob
    | Bool
    | Double
    | Float
    | Int
    | Object_
    | String
    | UInt
    | null,
  index: number
): Array | Blob | Bool | Double | Float | Int | Object_ | String | UInt | null {
  switch (Type[type]) {
    case 'NONE':
      return null
    case 'Bool':
      return accessor(index, new Bool())! as Bool
    case 'Int':
      return accessor(index, new Int())! as Int
    case 'UInt':
      return accessor(index, new UInt())! as UInt
    case 'Float':
      return accessor(index, new Float())! as Float
    case 'Double':
      return accessor(index, new Double())! as Double
    case 'String':
      return accessor(index, new String())! as String
    case 'Object':
      return accessor(index, new Object_())! as Object_
    case 'Array':
      return accessor(index, new Array())! as Array
    case 'Blob':
      return accessor(index, new Blob())! as Blob
    default:
      return null
  }
}
