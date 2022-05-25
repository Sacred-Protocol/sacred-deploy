// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

library Pairing {
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return r the sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {
        uint256[4] memory input = [
            p1.X, p1.Y,
            p2.X, p2.Y
        ];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * @return r the product of a point on G1 and a scalar, i.e.
     *         p == p.scalarMul(1) and p.plus(p) == p.scalarMul(2) for all
     *         points p.
     */
    function scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input = [p.X, p.Y, s];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input = [
            a1.X, a1.Y, a2.X[0], a2.X[1], a2.Y[0], a2.Y[1],
            b1.X, b1.Y, b2.X[0], b2.X[1], b2.Y[0], b2.Y[1],
            c1.X, c1.Y, c2.X[0], c2.X[1], c2.Y[0], c2.Y[1],
            d1.X, d1.Y, d2.X[0], d2.X[1], d2.Y[0], d2.Y[1]
        ];
        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, input, mul(24, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-opcode-failed");
        return out[0] != 0;
    }
}

contract Verifier {
    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    using Pairing for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[7] IC;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(8571140653425917855824418194141800112709978495988744104663815634356920658570), uint256(13045492117017606290607646485070621068611592597020143125817822314948279746776));
        vk.beta2 = Pairing.G2Point([uint256(8846737185625470183044932031787665174767267211598458410874212891602246317829), uint256(12366895573486083366055263172806278740093288121775585901905228618520056514694)], [uint256(15427629052844229895596745889065151394121428186069150946952795315428770190549), uint256(8142103938518107166090330345468555922518427465407110513730379622604797376621)]);
        vk.gamma2 = Pairing.G2Point([uint256(7999878274930031567124887896246510692014520780216590778277307936763317316933), uint256(9978712211086053371968916564167312626650341539949184177364020880444746464999)], [uint256(6619019440828964435728854184016987142628113751012845137994829119628612695297), uint256(15482220220375645311152405419279141283181522227743545000997403093493316958509)]);
        vk.delta2 = Pairing.G2Point([uint256(10393670144118624770517257812162187531413779473612891077941686198916724785452), uint256(20045484278530439816112549333864035994375661838929953437052798664880381984914)], [uint256(8648003831477185390848215488529230045591977235892478914109727451056246415897), uint256(15515174671683542049415887485740188709442414353987402702924176346724525689326)]);
        vk.IC[0] = Pairing.G1Point(uint256(2406212354583481469183186585086970194777693367829279654600487431871196102390), uint256(6131074661992305068304407790786294217045110902029798607284131470106308127798));
        vk.IC[1] = Pairing.G1Point(uint256(4735281876276303128602752815009194739608658996826619946120739377145235936857), uint256(8297858551625955242193070237919755061217099127041167018082983097169196174368));
        vk.IC[2] = Pairing.G1Point(uint256(4155354700823067184525040944837582105700770590926536725176835343949769284553), uint256(8620250994841950014705639804426492074549640984726829013083887658666763933200));
        vk.IC[3] = Pairing.G1Point(uint256(10047356440602304727464491729287166351060519795611392494888495227846820358205), uint256(8843375589863064230272544044004088192157503577344244906675346553881452451272));
        vk.IC[4] = Pairing.G1Point(uint256(5085872218206378649009467667505815762680626003347004751089634977003939557376), uint256(2871379856629072258052791077117004362082957603367475523477642411831544905683));
        vk.IC[5] = Pairing.G1Point(uint256(7222690094400061427177851346768679303693543336669270434330355885167876672836), uint256(21375604610703954355791818721276129243722175934184335053237803437045497980822));
        vk.IC[6] = Pairing.G1Point(uint256(15906909134057316996230975792552318543284144832048701109036276717993964851311), uint256(2062931998886209123401751442652186847939552727422534413336675138502050313279));

    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        bytes memory proof,
        uint256[6] memory input
    ) public view returns (bool) {
        uint256[8] memory p = abi.decode(proof, (uint256[8]));
        for (uint8 i = 0; i < p.length; i++) {
            // Make sure that each element in the proof is less than the prime q
            require(p[i] < PRIME_Q, "verifier-proof-element-gte-prime-q");
        }
        Pairing.G1Point memory proofA = Pairing.G1Point(p[0], p[1]);
        Pairing.G2Point memory proofB = Pairing.G2Point([p[2], p[3]], [p[4], p[5]]);
        Pairing.G1Point memory proofC = Pairing.G1Point(p[6], p[7]);

        VerifyingKey memory vk = verifyingKey();
        // Compute the linear combination vkX
        Pairing.G1Point memory vkX = vk.IC[0];
        for (uint256 i = 0; i < input.length; i++) {
            // Make sure that every input is less than the snark scalar field
            require(input[i] < SNARK_SCALAR_FIELD, "verifier-input-gte-snark-scalar-field");
            vkX = Pairing.plus(vkX, Pairing.scalarMul(vk.IC[i + 1], input[i]));
        }

        return Pairing.pairing(
            Pairing.negate(proofA),
            proofB,
            vk.alfa1,
            vk.beta2,
            vkX,
            vk.gamma2,
            proofC,
            vk.delta2
        );
    }
}

