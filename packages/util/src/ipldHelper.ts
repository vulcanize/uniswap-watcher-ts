import _ from 'lodash';

export const updateStateForElementaryType = (initialObject: any, stateVariable: string, value: string): any => {
  const object = _.cloneDeep(initialObject);
  const path = ['state', stateVariable];
  return _.set(object, path, value);
};

export const updateStateForMappingType = (initialObject: any, stateVariable: string, keys: string[], value: string): any => {
  const object = _.cloneDeep(initialObject);
  keys.unshift('state', stateVariable);
  return _.setWith(object, keys, value, Object);
};
