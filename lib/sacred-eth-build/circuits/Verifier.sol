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
        vk.alfa1 = Pairing.G1Point(uint256(950263570120070580435407213232328521448302467657962565695406906322669288292), uint256(19533033574207638596092343396177062969681834879205990282142502197920598569201));
        vk.beta2 = Pairing.G2Point([uint256(16354040892754978140554086929271118166015060166684754198143533182799831603432), uint256(16531315392438888271080549183047481086405470300722157728275562301917517414660)], [uint256(13155173938655383166786838120035823058898969724137121963979621257949598634883), uint256(14928028442498958640392914254122829802275076573868972802427546567373642386722)]);
        vk.gamma2 = Pairing.G2Point([uint256(9731439866370020610656428266008376584843489244465662576364491386049151261456), uint256(3622886105625242381448960548313361398266722892321633045557261591444073172305)], [uint256(20481655431933941833665454947018412525807232324131866887178505259968138320772), uint256(14042169381526103133346478673339458958173861361415463529781594644424110385840)]);
        vk.delta2 = Pairing.G2Point([uint256(6012860867675191300333471154996816185262038077224133701524503403313627363205), uint256(17040039400576757731645441753730411924208618887204113447351554282081418118122)], [uint256(7817706257381741869521443066755678702796852656660859454454321665197761558012), uint256(2079610464683751809947236819808283541996322334610944304590721259752174627957)]);
        vk.IC[0] = Pairing.G1Point(uint256(2456426629641014575206792394513364543603626833337588709480443915977016256741), uint256(8892177633946477283851529769827344084728353943675010837458725935979831776970));
        vk.IC[1] = Pairing.G1Point(uint256(21423680829524374430990119079311510691263241237038249098529352716727011489390), uint256(19862570989722550133915024353955436497430639733059630331475098153755637200600));
        vk.IC[2] = Pairing.G1Point(uint256(7494249802473278354877812356525693986416678501578022076318240372249214443102), uint256(16364109749721142664450465961697090967354583262079686476404700079100267967038));
        vk.IC[3] = Pairing.G1Point(uint256(21691663898874236182487232823441414914486882553376144200526743988146138454690), uint256(13526082314252470722929562570095506283943458311221345404698410497504497369865));
        vk.IC[4] = Pairing.G1Point(uint256(2368870797038458586657573688051629848509745141528266259796722190899111252232), uint256(15475183222390193647458100018042233893321119452002394864264690682448483342358));
        vk.IC[5] = Pairing.G1Point(uint256(16980836855331667589652735183630715490947335311098491555671737907714744357777), uint256(12409629592554312249948144566241495370830145643572802365344406140114706970408));
        vk.IC[6] = Pairing.G1Point(uint256(20933410334443731818504142246281637309996066619649332162299599831791284459067), uint256(2459050361195116566054559438963806718240446891699628170597093030304409829775));

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

