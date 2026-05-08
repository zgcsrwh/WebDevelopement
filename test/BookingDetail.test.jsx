import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MyBookings from "../src/pages/member/MyBookings";
import BookingDetail from "../src/pages/member/BookingDetail";
import { AuthProvider } from "../src/provider/AuthContext";
import { testViewBookings, clearCollection, testLoginMember, testLogout } from './TestCommonFunc';

vi.mock("../src/provider/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

const renderComponent = () =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<MyBookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/member/bookings/:id" element={<BookingDetail />} />
            <Route path="/:param1/:id" element={<BookingDetail />} />
            <Route path="*" element={<BookingDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
);
//screen.logTestingPlaygroundURL();
describe("BookingDetail Component Unit Test", () => {

    beforeEach(async () => {
        await testViewBookings();
        await testLoginMember();
    });

    afterEach(async () => {
        await clearCollection("request");
        await clearCollection("facility");
        await clearCollection("time_slot");
        await testLogout();
    });

    // Helper function to navigate from My Bookings to Booking Detail based on the target status
    async function navigateToDetailByStatus(statusText) {
        renderComponent();
        
        // Wait for MyBookings to finish loading
        await waitFor(() => {
            expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
        });
        
        // Find the specific booking card by its exact status text badge
        const articles = screen.getAllByRole('article');
        const targetCard = articles.find(card => within(card).queryByText(new RegExp(`^${statusText}$`, 'i')));
        
        expect(targetCard).toBeDefined();
        
        // Click View Details on that specific card
        const viewDetailsLink = within(targetCard).getByRole("link", { name: /View Details/i });
        fireEvent.click(viewDetailsLink);

        // Wait for BookingDetail to finish loading
        await waitFor(() => {
            expect(screen.queryByText(/Loading booking details/i)).not.toBeInTheDocument();
        });
    }

  it("Case_BookingDetail_1: From page 'My Bookings' select a booking and click 'View details' - Pending bookings", async () => {
    await navigateToDetailByStatus("pending");
    
    expect(screen.getByText("This booking request is waiting for staff review.")).toBeInTheDocument();
  });

  it("Case_BookingDetail_2: From page 'My Bookings' select a booking and click 'View details' - Upcoming bookings", async () => {
    await navigateToDetailByStatus("upcoming");
    
    expect(screen.getByText("This booking is confirmed and scheduled.")).toBeInTheDocument();
  });

  it("Case_BookingDetail_3: From page 'My Bookings' select a booking and click 'View details' - Rejected bookings", async () => {
    await navigateToDetailByStatus("rejected");
    
    expect(screen.getByText("This booking request was rejected.")).toBeInTheDocument();
  });

  it("Case_BookingDetail_4: From page 'My Bookings' select a booking and click 'View details' - Alternative suggested", async () => {
    await navigateToDetailByStatus("alternative suggested");
 
    // Title
    expect(screen.getByText("Staff Feedback")).toBeInTheDocument();
    
    // Staff Response body (from mock data in TestCommonFunc)
    expect(screen.getByText("Suggested Description")).toBeInTheDocument();
  
    // Action button
    expect(screen.getByRole("link", { name: /Create New/i })).toBeInTheDocument();
  });

  it("Case_BookingDetail_5: From page 'My Bookings' select a booking and click 'View details' - Cancelled", async () => {
    await navigateToDetailByStatus("cancelled");
    
    expect(screen.getByText("This booking was cancelled.")).toBeInTheDocument();
  });

  it("Case_BookingDetail_6: From page 'My Bookings' select a booking and click 'View details' - Completed", async () => {
    await navigateToDetailByStatus("completed");
    
    expect(screen.getByText("This booking session has been completed.")).toBeInTheDocument();
  });

  // Having problem
  it("Case_BookingDetail_7: From page 'My Bookings' select a booking and click 'View details' - No show", async () => {
    await navigateToDetailByStatus("no show");
    expect(screen.getByText("This booking was marked as no-show because no arrival was confirmed before the session started.")).toBeInTheDocument();
  });
});