
import { calculateParkingCost, generateTicketId, getCurrentShift } from '../utils/parkingLogic';
import { ParkingConfig, ParkingTicket } from '../types';

const mockConfig: ParkingConfig = {
    hourlyRate: 15, // Base rate
    dailyMax: 200, // Max daily
    freeMinutes: 15, // Free tolerance
    selloDiscount: 0
};

const createTicket = (entryTime: string, type: any = 'NORMAL', convention: any = 'NONE'): ParkingTicket => ({
    id: 'test-123',
    entryTime,
    plate: 'ABC-123',
    status: 'active',
    type,
    convention,
    registeredBy: 'tester'
});

function runTest(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name} PASSED`);
    } catch (e: any) {
        console.error(`❌ ${name} FAILED: ${e.message}`);
    }
}

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
}

function assertEquals(actual: any, expected: any, msg: string) {
    if (actual !== expected) throw new Error(`${msg} - Expected ${expected}, got ${actual}`);
}

console.log("Starting Parking Logic Tests...");

// Test 1: Free minutes
runTest("Free Minutes (10 min)", () => {
    const entry = new Date();
    entry.setMinutes(entry.getMinutes() - 10);
    const ticket = createTicket(entry.toISOString());
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 0, "Should be free within 15 mins");
});

// Test 2: First Hour (45 min) -> $15
runTest("First Hour (45 min)", () => {
    const entry = new Date();
    entry.setMinutes(entry.getMinutes() - 45);
    const ticket = createTicket(entry.toISOString());
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 15, "Should be $15 for 45 mins");
});

// Test 3: Tolerance after 1 hour (1h 10m) -> $15 (Rules say <= 75 min is 1 hour)
runTest("Tolerance 1h 10m", () => {
    const entry = new Date();
    entry.setMinutes(entry.getMinutes() - 70);
    const ticket = createTicket(entry.toISOString());
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 15, "Should be $15 for 70 mins (<= 75)");
});

// Test 4: Second Hour (1h 20m) -> $30
runTest("Second Hour 1h 20m", () => {
    const entry = new Date();
    entry.setMinutes(entry.getMinutes() - 80);
    const ticket = createTicket(entry.toISOString());
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 30, "Should be $30 for 80 mins");
});

// Test 5: Locatario Rate (1h) -> $10
runTest("Locatario 1h", () => {
    const entry = new Date();
    entry.setMinutes(entry.getMinutes() - 60);
    const ticket = createTicket(entry.toISOString(), 'LOCATARIO');
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 10, "Locatario should pay $10 for 1h");
});

// Test 6: Pension -> $0
runTest("Pension", () => {
    const entry = new Date();
    entry.setHours(entry.getHours() - 5);
    const ticket = createTicket(entry.toISOString(), 'PENSION');
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 0, "Pension should be free exiting");
});

// Test 7: Partner convention (3 hours free by default)
runTest("Convenio 2h", () => {
    const entry = new Date();
    entry.setHours(entry.getHours() - 2);
    const ticket = createTicket(entry.toISOString(), 'NORMAL', 'CONVENIO');
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 0, "Convenio should be free for 2h");
});

runTest("Convenio 4h", () => {
    const entry = new Date();
    entry.setHours(entry.getHours() - 4);
    const ticket = createTicket(entry.toISOString(), 'NORMAL', 'CONVENIO');
    // 4 hours total. 3 free. 1 billable hour * $15 = $15
    const result = calculateParkingCost(ticket, mockConfig);
    assertEquals(result.amount, 15, "Convenio should pay $15 for 4h (1h charged)");
});

// Test 9: Invalid or Future Entry Time
runTest("Invalid Entry Time Guard", () => {
    const ticketInvalid = createTicket("invalid-date-string");
    const resultInvalid = calculateParkingCost(ticketInvalid, mockConfig);
    assertEquals(resultInvalid.amount, 0, "Invalid date should return amount 0");
    assertEquals(resultInvalid.duration, 0, "Invalid date should return duration 0");
});

console.log("Tests Completed.");
