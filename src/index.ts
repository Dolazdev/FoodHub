import {
  $update,
  $query,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Principal,
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

// Define types for products, orders, and customer interactions
type FoodProduct = Record<{
  id: string;
  name: string;
  description: string;
  price: nat64;
  quantityAvailable: number;
}>;

type FoodPayload = Record<{
  name: string;
  description: string;
  price: nat64;
  quantityAvailable: number;
}>;

type Order = Record<{
  id: string;
  customerId: Principal;
  productId: string;
  quantity: number;
  status: string;
  createdAt: nat64;
}>;

type OrderPayload = Record<{
  productId: string;
  quantity: number;
}>;

type CustomerInteraction = Record<{
  id: string;
  customerId: Principal;
  productId: string;
  rating: number;
  review: string;
  createdAt: nat64;
}>;

type CustomerInteractionPayload = Record<{
  productId: string;
  rating: number;
  review: string;
  
}>;

// Define storage for products, orders, and customer interactions
const foodProducts = new StableBTreeMap<string, FoodProduct>(0, 44, 512);
const orders = new StableBTreeMap<string, Order>(1, 44, 512);
const customerInteractions = new StableBTreeMap<string, CustomerInteraction>(2, 44, 512);

// Set up with wallet of local user
const owner: Principal = ic.caller();

// Query
// Function to get all products by ID
$query;
export function getProductsbyId(id: string): Result<FoodProduct, string> {
  // Parameter Validation: Ensure that ID is provided
  if (!id) {
    return Result.Err<FoodProduct, string>('Invalid ID provided.');
  }

  return match(foodProducts.get(id), {
    Some: (product) => Result.Ok<FoodProduct, string>(product),
    None: () => Result.Err<FoodProduct, string>(`Product with id=${id} not found`),
  });
}

// Function for getting Customer's interactions
$query;
export function getCustomerInteractionsByProduct(productId: string): Result<Vec<CustomerInteraction>, string> {
  // Parameter Validation: Ensure that ID is provided
  if (!productId) {
    return Result.Err<Vec<CustomerInteraction>, string>('Invalid Product ID provided.');
  }

  // Return all customer interactions for a given product
  return Result.Ok(customerInteractions.values().filter((interaction) => interaction.productId === productId));
}

// Functions for managing customer's orders
$query;
export function getOrdersByCustomer(customerId: string): Result<Vec<Order>, string> {
  // Parameter Validation: Ensure that ID is provided
  if (!customerId) {
    return Result.Err<Vec<Order>, string>('Invalid Customer ID provided.');
  }

  return Result.Ok(orders.values().filter((order) => order.customerId.toString() === customerId));
}

// Functions for managing products
$query;
export function getProducts(): Result<Vec<FoodProduct>, string> {
  return Result.Ok(foodProducts.values());
}

// Update functions
// Functions for managing products
$update;
export function addProduct(payload: FoodPayload): Result<FoodProduct, string> {
  // Payload Validation: Ensure that required fields are present in the payload
  if (!payload.name || !payload.description || !payload.price || !payload.quantityAvailable) {
    return Result.Err<FoodProduct, string>('Invalid payload');
  }

  // Create a new product record
  const productId = uuidv4();
  const product: FoodProduct = {
    id: productId,
    name: payload.name,
    description: payload.description,
    price: payload.price,
    quantityAvailable: payload.quantityAvailable,
  };

  // Check for duplicate item by ID
  const existingProduct = foodProducts.get(product.id);
  if (existingProduct) {
    return Result.Err<FoodProduct, string>('Product with the same id already exists');
  }

  try {
    foodProducts.insert(product.id, product);
    return Result.Ok<FoodProduct, string>(product);
  } catch (error) {
    return Result.Err<FoodProduct, string>('Failed to create product');
  }
}

$update;
export function updateProductQuantity(productId: string, newQuantity: number): Result<FoodProduct, string> {
  // Parameter Validation: Ensure that ID is provided
  if (!productId) {
    return Result.Err<FoodProduct, string>('Invalid Product ID provided.');
  }

  return match(foodProducts.get(productId), {
    Some: (product) => {
      // Owner Authorization: Check if the caller is the owner
      if (owner.toString() !== ic.caller().toString()) {
        return Result.Err<FoodProduct, string>('You are not the owner of this product');
      }

      // Update the product quantity
      const updatedProduct: FoodProduct = { ...product, quantityAvailable: newQuantity };

      try {
        foodProducts.insert(product.id, updatedProduct);
        return Result.Ok<FoodProduct, string>(updatedProduct);
      } catch (error) {
        return Result.Err<FoodProduct, string>(`Couldn't update Product with id=${productId}. Product not found`);
      }
    },
    None: () => Result.Err<FoodProduct, string>(`Couldn't update Product with id=${productId}. Product not found`),
  });
}

// Functions for placing orders
$update;
export function placeOrder(payload: OrderPayload): Result<Order, string> {
  // Payload Validation: Ensure that required fields are present in the payload
  if (!payload.productId || !payload.quantity) {
    return Result.Err<Order, string>('Invalid payload');
  }

  return match(foodProducts.get(payload.productId), {
    Some: (product) => {
      // Order Authorization: Check if the caller is the owner
      const orderId = uuidv4();
      const order: Order = {
        id: orderId,
        customerId: ic.caller(),
        productId: payload.productId,
        quantity: payload.quantity,
        status: 'placed',
        createdAt: ic.time(),
      };

      // Insert the order into the orders map
      orders.insert(orderId, order);

      // Update the product quantity
      const updatedProduct: FoodProduct = { ...product, quantityAvailable: product.quantityAvailable - payload.quantity };
      foodProducts.insert(product.id, updatedProduct);

      return Result.Ok<Order, string>(order);
    },
    None: () => Result.Err<Order, string>('Product not found'),
  });
}

// Function for canceling order
$update;
export function cancelOrder(orderId: string): boolean {
  // Parameter Validation: Ensure that ID is provided
  if (!orderId) {
    return false;
  }

  return match(orders.get(orderId), {
    Some: (order) => {
      // Owner Authorization: Check if the caller is the owner
      if (order.customerId.toString() !== ic.caller().toString()) {
        return false;
      }

      if (order && order.status === 'placed') {
        // Cancel the order
        order.status = 'cancelled';
        return true;
      }

      return false; // Order not found or cannot be confirmed
    },
    None: () => false,
  });
}

// Function for confirming order
$update;
export function confirmOrder(orderId: string): boolean {
  // Parameter Validation: Ensure that ID is provided
  if (!orderId) {
    return false;
  }

  return match(orders.get(orderId), {
    Some: (order) => {
      if (order && order.status === 'placed') {
        // Confirm the order
        order.status = 'confirmed';
        return true;
      }

      return false; // Order not found or cannot be confirmed
    },
    None: () => false,
  });
}

// Function for delivering order
$update;
export function deliverOrder(orderId: string): boolean {
  // Parameter Validation: Ensure that ID is provided
  if (!orderId) {
    return false;
  }

  return match(orders.get(orderId), {
    Some: (order) => {
      // Owner Authorization: Check if the caller is the owner
      if (owner.toString() !== ic.caller().toString()) {
        return false;
      }

      if (order && order.status === 'confirmed') {
        // Deliver the order
        order.status = 'delivered';
        return true;
      }

      return false; // Order not found or cannot be delivered
    },
    None: () => false,
  });
}

// Functions for managing customer interactions
$update;
export function addCustomerInteraction(payload: CustomerInteractionPayload): Result<CustomerInteraction, string> {
  // Payload Validation: Ensure that required fields are present in the payload
  if (!payload.productId || !payload.rating || !payload.review) {
    return Result.Err<CustomerInteraction, string>('Invalid payload');
  }

  // Create a new customer interaction record
  const interactionId = uuidv4();
  const interaction: CustomerInteraction = {
    id: interactionId,
    customerId: ic.caller(),
    productId: payload.productId,
    rating: payload.rating,
    review: payload.review,
    createdAt: ic.time(),
  };

  try {
    // Insert the interaction into the customerInteractions map
    customerInteractions.insert(interactionId, interaction);
    return Result.Ok(interaction);
  } catch (error) {
    return Result.Err<CustomerInteraction, string>('Failed to create customer interaction');
  }
}

// Cryptographic utility for generating random values
globalThis.crypto = {
  // @ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
};
